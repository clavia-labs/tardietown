import { Context, Effect, Layer, Schema } from "effect"
import { actor } from "tardie/core"
import { serviceMethod } from "../agent/serviceMethod"
import { LibraryStore, type LibraryPolicy } from "./store"

export type LibraryRequest =
  | { readonly kind: "list"; readonly author: string; readonly operationId: string; readonly limit: number }
  | { readonly kind: "read"; readonly author: string; readonly operationId: string; readonly id: string }
  | { readonly kind: "search"; readonly author: string; readonly operationId: string; readonly query: string; readonly limit: number }
  | { readonly kind: "add"; readonly author: string; readonly operationId: string; readonly title: string; readonly content: string; readonly sourceUrl: string | null }

const LibraryEntrySchema = Schema.Struct({ id: Schema.String, title: Schema.String, sourceUrl: Schema.optionalKey(Schema.String), author: Schema.String, at: Schema.Number, characters: Schema.Number })
const LibraryDocumentSchema = Schema.Struct({ ...LibraryEntrySchema.fields, content: Schema.String })
const LibrarySearchMatchSchema = Schema.Struct({ ...LibraryEntrySchema.fields, excerpt: Schema.String })
const LibraryPolicySchema = Schema.Struct({
  maxEntries: Schema.Number,
  maxTitleCharacters: Schema.Number,
  maxContentCharacters: Schema.Number,
  maxStoredCharacters: Schema.Number,
  maxListEntries: Schema.Number,
  maxSearchResults: Schema.Number,
  maxSearchQueryCharacters: Schema.Number,
  searchExcerptCharacters: Schema.Number
})
export const LibraryResponseSchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("list"), entries: Schema.Array(LibraryEntrySchema), effectiveLimit: Schema.Number, policy: LibraryPolicySchema }),
  Schema.Struct({ kind: Schema.Literal("read"), document: Schema.optionalKey(LibraryDocumentSchema), policy: LibraryPolicySchema }),
  Schema.Struct({ kind: Schema.Literal("search"), matches: Schema.Array(LibrarySearchMatchSchema), effectiveLimit: Schema.Number, policy: LibraryPolicySchema }),
  Schema.Struct({ kind: Schema.Literal("add"), ok: Schema.Literal(true), entry: LibraryEntrySchema, existing: Schema.Boolean, policy: LibraryPolicySchema }),
  Schema.Struct({ kind: Schema.Literal("add"), ok: Schema.Literal(false), error: Schema.String, policy: LibraryPolicySchema })
])
export type LibraryResponse = typeof LibraryResponseSchema.Type

export class LibraryCollection extends Context.Service<LibraryCollection, LibraryStore>()("town/LibraryCollection") {}
const identity = { author: Schema.String, operationId: Schema.String }
const requestSchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("list"), ...identity, limit: Schema.Number }),
  Schema.Struct({ kind: Schema.Literal("read"), ...identity, id: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("search"), ...identity, query: Schema.String, limit: Schema.Number }),
  Schema.Struct({ kind: Schema.Literal("add"), ...identity, title: Schema.String, content: Schema.String, sourceUrl: Schema.NullOr(Schema.String) })
])

const request = serviceMethod({
  name: "library-request",
  input: requestSchema,
  output: LibraryResponseSchema,
  execute: (input: LibraryRequest) => Effect.map(LibraryCollection, (store): LibraryResponse => {
    if (input.kind === "list") {
      const effectiveLimit = Math.min(input.limit, store.policy.maxListEntries)
      return { kind: "list", entries: store.list(effectiveLimit), effectiveLimit, policy: store.policy }
    }
    if (input.kind === "read") {
      const document = store.read(input.id)
      return { kind: "read", ...(document ? { document } : {}), policy: store.policy }
    }
    if (input.kind === "search") {
      const effectiveLimit = Math.min(input.limit, store.policy.maxSearchResults)
      return { kind: "search", matches: store.search(input.query, effectiveLimit), effectiveLimit, policy: store.policy }
    }
    return { kind: "add", ...store.add(input.author, input.operationId, { title: input.title, content: input.content, ...(input.sourceUrl === null ? {} : { sourceUrl: input.sourceUrl }) }) }
  })
})

export const createLibraryActor = () => actor({ name: "town-library", methods: { request: request.method }, components: [request.component] })
export const libraryCollectionLayer = (store: LibraryStore) => Layer.succeed(LibraryCollection, store)
export type LibraryClientRequest = LibraryRequest extends infer Request ? Request extends LibraryRequest ? Omit<Request, "author" | "operationId"> : never : never
export interface LibraryActorDispatcher { readonly request: (request: LibraryClientRequest, operationId: string) => Effect.Effect<LibraryResponse>; readonly policy: LibraryPolicy }
