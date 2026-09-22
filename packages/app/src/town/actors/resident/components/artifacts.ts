import { Context, Effect, Layer } from "effect"
import { tool } from "tardie/agent"
import type { ArtifactActorDispatcher } from "../../artifacts/actor"
export class SharedArtifacts extends Context.Service<SharedArtifacts, { dispatcher: ArtifactActorDispatcher; author: string }>()("town/SharedArtifacts") {}
export const artifactLayer = (dispatcher: ArtifactActorDispatcher, author: string) => Layer.succeed(SharedArtifacts, { dispatcher, author })
const schema = (properties: Record<string, unknown>, required: string[]) => ({ type: "object", properties, required, additionalProperties: false })
const text = { type: "string", minLength: 1 }
export const artifacts = () => tool([
  { spec: { name: "list_artifacts", description: "List the town's shared Markdown artifacts and current revisions. Use a common file for the final deliverable rather than making duplicate final documents.", inputSchema: schema({}, []) }, run: (_: unknown, context: { callId: string; turn?: string }) => Effect.flatMap(SharedArtifacts, ({dispatcher, author}) => { const operationId = JSON.stringify([context.turn, context.callId]); return dispatcher.request({ kind: "list", author, operationId }, operationId) }) },
  { spec: { name: "read_artifact", description: "Read a shared Markdown artifact and its revision history before editing it.", inputSchema: schema({ path: text }, ["path"]) }, run: (input: unknown, context: { callId: string; turn?: string }) => Effect.flatMap(SharedArtifacts, ({dispatcher, author}) => {
    const path = (input as { path?: unknown })?.path
    if (typeof path !== "string") return Effect.succeed<unknown>({ ok: false, error: "Artifact not found." })
    const operationId = JSON.stringify([context.turn, context.callId])
    return Effect.map(dispatcher.request({ kind: "read", author, operationId, path }, operationId), (response) => response.kind === "read" && response.artifact ? { ok: true, artifact: response.artifact, history: response.history } : { ok: false, error: "Artifact not found." })
  }) },
  { spec: { name: "publish_artifact", description: "Publish Markdown content into the shared workspace. expectedRevision 0 creates a file; updates must use the revision returned by read_artifact. Identity is runtime-owned. Publishing does not post to the forum or wake residents.", inputSchema: schema({ path: text, content: text, summary: text, expectedRevision: { type: "integer", minimum: 0 } }, ["path", "content", "summary", "expectedRevision"]) }, run: (input: unknown, context: { callId: string; turn?: string }) => Effect.flatMap(SharedArtifacts, ({dispatcher, author}): Effect.Effect<unknown> => {
    if (!input || typeof input !== "object") return Effect.succeed({ ok: false, error: "Invalid artifact arguments." })
    const value = input as Record<string, unknown>
    if (Object.keys(value).some(key => !["path", "content", "summary", "expectedRevision"].includes(key)) || typeof value.path !== "string" || typeof value.content !== "string" || typeof value.summary !== "string" || typeof value.expectedRevision !== "number") return Effect.succeed({ ok: false, error: "Use path, content, summary and expectedRevision only." })
    const operationId = JSON.stringify([context.turn, context.callId])
    return dispatcher.request({ kind: "publish", author, operationId, path: value.path, content: value.content, summary: value.summary, expectedRevision: value.expectedRevision }, operationId)
  }) }
], "Create shared Markdown deliverables with publish_artifact. List and read existing artifacts first so you can improve the agreed final document. Keep source links in research documents. Files and revisions are attributed to you automatically.", { name: "artifacts" })
