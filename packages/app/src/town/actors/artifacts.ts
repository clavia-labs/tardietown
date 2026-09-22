import { Context, Effect, Layer, Schema } from "effect"
import { actor } from "tardie/core"
import { serviceMethod } from "./serviceMethod"
import { ArtifactStore, type ArtifactPolicy } from "../workspace/artifacts/store"

export type ArtifactRequest =
  | { readonly kind: "list"; readonly author: string; readonly operationId: string }
  | { readonly kind: "read"; readonly author: string; readonly operationId: string; readonly path: string; readonly revision?: number }
  | { readonly kind: "history"; readonly author: string; readonly operationId: string; readonly path: string }
  | { readonly kind: "publish"; readonly author: string; readonly operationId: string; readonly path: string; readonly content: string; readonly summary: string; readonly expectedRevision: number }
const ArtifactSchema = Schema.Struct({ path: Schema.String, revision: Schema.Number, author: Schema.String, summary: Schema.String, at: Schema.Number, characters: Schema.Number })
const ArtifactDocumentSchema = Schema.Struct({ ...ArtifactSchema.fields, content: Schema.String })
const ArtifactPolicySchema = Schema.Struct({ maxFiles: Schema.Number, maxCharacters: Schema.Number, maxStoredCharacters: Schema.Number })
export const ArtifactResponseSchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("list"), files: Schema.Array(ArtifactSchema), policy: ArtifactPolicySchema }),
  Schema.Struct({ kind: Schema.Literal("read"), artifact: Schema.optionalKey(ArtifactDocumentSchema), history: Schema.Array(ArtifactSchema) }),
  Schema.Struct({ kind: Schema.Literal("history"), history: Schema.Array(ArtifactSchema) }),
  Schema.Struct({ kind: Schema.Literal("publish"), ok: Schema.Literal(true), artifact: ArtifactSchema, policy: ArtifactPolicySchema }),
  Schema.Struct({ kind: Schema.Literal("publish"), ok: Schema.Literal(false), error: Schema.String, policy: ArtifactPolicySchema, currentRevision: Schema.optionalKey(Schema.Number) })
])
export type ArtifactResponse = typeof ArtifactResponseSchema.Type

export class ArtifactWorkspace extends Context.Service<ArtifactWorkspace, ArtifactStore>()("town/ArtifactWorkspace") {}
const request = serviceMethod({
  name: "artifact-request",
  input: Schema.Union([
    Schema.Struct({ kind: Schema.Literal("list"), author: Schema.String, operationId: Schema.String }),
    Schema.Struct({ kind: Schema.Literal("read"), author: Schema.String, operationId: Schema.String, path: Schema.String, revision: Schema.optionalKey(Schema.Number) }),
    Schema.Struct({ kind: Schema.Literal("history"), author: Schema.String, operationId: Schema.String, path: Schema.String }),
    Schema.Struct({ kind: Schema.Literal("publish"), author: Schema.String, operationId: Schema.String, path: Schema.String, content: Schema.String, summary: Schema.String, expectedRevision: Schema.Number })
  ]),
  output: ArtifactResponseSchema,
  execute: (input: ArtifactRequest) => Effect.map(ArtifactWorkspace, (store): ArtifactResponse => {
    if (input.kind === "list") return { kind: "list", files: store.list(), policy: store.policy }
    if (input.kind === "read") { const artifact = store.read(input.path, input.revision); return { kind: "read", ...(artifact ? { artifact } : {}), history: store.history(input.path) } }
    if (input.kind === "history") return { kind: "history", history: store.history(input.path) }
    const result = store.publish(input.author, input.operationId, { path: input.path, content: input.content, summary: input.summary, expectedRevision: input.expectedRevision })
    if (result.ok) return { kind: "publish", ...result }
    const currentRevision = "currentRevision" in result && typeof result.currentRevision === "number" ? result.currentRevision : undefined
    return { kind: "publish", ok: false, error: result.error, policy: "policy" in result ? result.policy : store.policy, ...(currentRevision === undefined ? {} : { currentRevision }) }
  })
})

export const createArtifactActor = () => actor({ name: "town-artifacts", methods: { request: request.method }, components: [request.component] })
export const artifactWorkspaceLayer = (store: ArtifactStore) => Layer.succeed(ArtifactWorkspace, store)
export type BoundArtifactRequest =
  | { readonly kind: "list" }
  | { readonly kind: "read"; readonly path: string; readonly revision?: number }
  | { readonly kind: "history"; readonly path: string }
  | { readonly kind: "publish"; readonly path: string; readonly content: string; readonly summary: string; readonly expectedRevision: number }
export interface ArtifactActorDispatcher { readonly request: (request: ArtifactRequest, invocationId: string) => Effect.Effect<ArtifactResponse>; readonly policy: ArtifactPolicy }
