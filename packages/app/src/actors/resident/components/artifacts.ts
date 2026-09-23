import { toolSchema as schema } from "./toolSchema"
import { Context, Effect, Layer } from "effect"
import { tool } from "tardie/agent"
import type { ArtifactActorDispatcher } from "../../artifacts/actor"
export class SharedArtifacts extends Context.Service<SharedArtifacts, { dispatcher: ArtifactActorDispatcher; author: string }>()("town/SharedArtifacts") {}
export const artifactLayer = (dispatcher: ArtifactActorDispatcher, author: string) => Layer.succeed(SharedArtifacts, { dispatcher, author })
const text = { type: "string", minLength: 1 }
export const artifacts = () => tool([
  { spec: { name: "list_artifacts", description: "List the town's shared Markdown artifacts and current revisions. Use a common file for the final deliverable rather than making duplicate final documents.", inputSchema: schema({}, []) }, run: (_: unknown, context: { callId: string; turn?: string }) => Effect.flatMap(SharedArtifacts, ({dispatcher, author}) => { const operationId = JSON.stringify([context.turn, context.callId]); return dispatcher.request({ kind: "list", author, operationId }, operationId) }) },
  { spec: { name: "read_artifact", description: "Read a shared Markdown artifact and its revision history before reviewing it. Pass revision to read the exact submitted version.", inputSchema: schema({ path: text, revision: { type: "integer", minimum: 1 } }, ["path"]) }, run: (input: unknown, context: { callId: string; turn?: string }) => Effect.flatMap(SharedArtifacts, ({dispatcher, author}) => {
    const path = (input as { path?: unknown })?.path
    if (typeof path !== "string") return Effect.succeed<unknown>({ ok: false, error: "Artifact not found." })
    const revision = (input as { revision?: number | null }).revision
    if (revision != null && (!Number.isSafeInteger(revision) || revision < 1)) return Effect.succeed<unknown>({ ok: false, error: "Invalid revision." })
    const operationId = JSON.stringify([context.turn, context.callId])
    return Effect.map(dispatcher.request({ kind: "read", author, operationId, path, ...(revision == null ? {} : { revision }) }, operationId), (response) => response.kind === "read" && response.artifact ? { ok: true, artifact: response.artifact, history: response.history } : { ok: false, error: "Artifact not found." })
  }) },
], "Read shared deliverables with list_artifacts and read_artifact. To draft, use your mission workspace; to publish, use submit_mission. Read the exact submitted revision before reviewing a mission.", { name: "artifacts" })
