import { Context, Effect, Layer } from "effect"
import { tool } from "tardie/agent"
import type { LibraryActorDispatcher } from "../../library/actor"
import type { LibraryPolicy } from "../../library/store"

export class SharedLibrary extends Context.Service<SharedLibrary, { dispatcher: LibraryActorDispatcher; author: string }>()("town/SharedLibrary") {}

export const libraryLayer = (dispatcher: LibraryActorDispatcher, author: string) => Layer.succeed(SharedLibrary, { dispatcher, author })

const text = { type: "string", minLength: 1 } as const
const positiveInteger = { type: "integer", minimum: 1 } as const
const schema = (properties: Record<string, unknown>, required: readonly string[]) => ({ type: "object", properties, required, additionalProperties: false })

export const library = () => tool([
  {
    spec: {
      name: "list_library",
      description: "List reference metadata in the town library. Results are newest first and bounded by the visible library policy.",
      inputSchema: schema({ limit: positiveInteger }, [])
    },
    run: (input: unknown, context: { readonly callId: string; readonly turn?: string }) => Effect.flatMap(SharedLibrary, ({ dispatcher }): Effect.Effect<unknown> => {
      const limit = optionalPositiveInteger(input, "limit", ["limit"])
      if (limit === false) return Effect.succeed(invalid(dispatcher.policy))
      return Effect.map(dispatcher.request({ kind: "list", limit: limit ?? dispatcher.policy.maxListEntries }, operationId(context)), response => response.kind === "list" ? { ok: true as const, entries: response.entries, effectiveLimit: response.effectiveLimit, policy: response.policy } : invalid(dispatcher.policy))
    })
  },
  {
    spec: {
      name: "read_library",
      description: "Read the complete preserved content of one library reference by its stable entry ID.",
      inputSchema: schema({ id: text }, ["id"])
    },
    run: (input: unknown, context: { readonly callId: string; readonly turn?: string }) => Effect.flatMap(SharedLibrary, ({ dispatcher }): Effect.Effect<unknown> => {
      const value = record(input)
      if (!value || !only(value, ["id"]) || typeof value.id !== "string") return Effect.succeed(invalid(dispatcher.policy))
      return Effect.map(dispatcher.request({ kind: "read", id: value.id }, operationId(context)), response => response.kind === "read" && response.document ? { ok: true as const, document: response.document, policy: response.policy } : { ok: false as const, error: "Library entry not found.", policy: dispatcher.policy })
    })
  },
  {
    spec: {
      name: "search_library",
      description: "Search titles, source URLs, and preserved content using plain case-insensitive lexical terms. Every query term must occur. Results include bounded excerpts and the visible library policy.",
      inputSchema: schema({ query: text, limit: positiveInteger }, ["query"])
    },
    run: (input: unknown, context: { readonly callId: string; readonly turn?: string }) => Effect.flatMap(SharedLibrary, ({ dispatcher }): Effect.Effect<unknown> => {
      const value = record(input)
      const limit = optionalPositiveInteger(input, "limit", ["query", "limit"])
      if (!value || !only(value, ["query", "limit"]) || typeof value.query !== "string" || limit === false || !value.query.trim()) return Effect.succeed(invalid(dispatcher.policy))
      if (value.query.length > dispatcher.policy.maxSearchQueryCharacters) return Effect.succeed({ ok: false as const, error: "The query exceeds maxSearchQueryCharacters.", policy: dispatcher.policy })
      return Effect.map(dispatcher.request({ kind: "search", query: value.query, limit: limit ?? dispatcher.policy.maxSearchResults }, operationId(context)), response => response.kind === "search" ? { ok: true as const, matches: response.matches, effectiveLimit: response.effectiveLimit, policy: response.policy } : invalid(dispatcher.policy))
    })
  },
  {
    spec: {
      name: "add_to_library",
      description: "Add a reference supplied in full by the resident. This tool does not fetch URLs or generate content. Identity is supplied by the runtime. A normalized duplicate source URL returns the existing entry.",
      inputSchema: schema({ title: text, content: text, sourceUrl: text }, ["title", "content"])
    },
    run: (input: unknown, context: { readonly callId: string; readonly turn?: string }) => Effect.flatMap(SharedLibrary, ({ dispatcher }): Effect.Effect<unknown> => {
      const value = decodeAddLibraryInput(input)
      if (!value) return Effect.succeed(invalid(dispatcher.policy))
      return dispatcher.request({ kind: "add", title: value.title, content: value.content, sourceUrl: value.sourceUrl ?? null }, operationId(context))
    })
  }
], "Use the shared library for references that help the town. Search or list before adding. Add only content you already have; sourceUrl is metadata and is not fetched. Library entries are attributed to you automatically.", { name: "library" })

const record = (input: unknown): Record<string, unknown> | undefined => input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : undefined
const only = (value: Record<string, unknown>, names: readonly string[]) => Object.keys(value).every(key => names.includes(key))
const optionalPositiveInteger = (input: unknown, name: string, names: readonly string[]): number | undefined | false => {
  const value = record(input)
  if (!value || !only(value, names)) return false
  const candidate = value[name]
  return candidate === undefined || candidate === null ? undefined : Number.isSafeInteger(candidate) && (candidate as number) > 0 ? candidate as number : false
}
const invalid = (policy: LibraryPolicy) => ({ ok: false as const, error: "Invalid library arguments.", policy })
const operationId = (context: { readonly callId: string; readonly turn?: string }) => JSON.stringify([context.turn, context.callId])
export const decodeAddLibraryInput = (input: unknown): { title: string; content: string; sourceUrl?: string } | undefined => {
  const value = record(input)
  if (!value || !only(value, ["title", "content", "sourceUrl"]) || typeof value.title !== "string" || typeof value.content !== "string" || (value.sourceUrl !== undefined && value.sourceUrl !== null && typeof value.sourceUrl !== "string")) return undefined
  return { title: value.title, content: value.content, ...(typeof value.sourceUrl === "string" ? { sourceUrl: value.sourceUrl } : {}) }
}
