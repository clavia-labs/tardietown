import { Context, Effect, Layer } from "effect"
import { tool } from "tardie/agent"
import { MissionStore, type MissionCommand, type MissionResult } from "../../forum/missions/store"

export type ExecuteMission = (command: MissionCommand, operationId: string) => Effect.Effect<MissionResult>
export class SharedMissions extends Context.Service<SharedMissions, { store: MissionStore; execute: ExecuteMission }>()("town/SharedMissions") {}
export const missionLayer = (store: MissionStore, execute: ExecuteMission) => Layer.succeed(SharedMissions, { store, execute })
const schema = (properties: Record<string, unknown>, required: string[]) => ({ type: "object", properties, required, additionalProperties: false })
const text = { type: "string", minLength: 1 }
const missionId = { type: "string", minLength: 1 }

const commandTool = (name: MissionCommand["type"], description: string, properties: Record<string, unknown>, required: string[]) => ({
  spec: { name, description, inputSchema: schema(properties, required) },
  run: (input: unknown, context: { callId: string; turn?: string }) => Effect.flatMap(SharedMissions, ({ store, execute }): Effect.Effect<MissionResult> => {
    if (!input || typeof input !== "object" || Array.isArray(input)) return Effect.succeed({ ok: false, error: "Invalid mission arguments.", policy: store.policy })
    const value = input as Record<string, unknown>
    const allowed = Object.keys(properties)
    if (Object.keys(value).some((key) => !allowed.includes(key))) return Effect.succeed({ ok: false, error: "Invalid mission arguments.", policy: store.policy })
    const normalized = Object.fromEntries(Object.entries(value).filter(([, item]) => item !== null))
    if (required.some((key) => typeof normalized[key] !== "string" || !(normalized[key] as string).trim()) || Object.values(normalized).some((item) => typeof item !== "string")) return Effect.succeed({ ok: false, error: "Mission arguments must be nonempty strings.", policy: store.policy })
    return execute({ type: name, ...normalized } as MissionCommand, JSON.stringify([context.turn, context.callId]))
  })
})

export const missions = () => tool([
  { spec: { name: "list_missions", description: "List the mission hierarchy, claims, pending handoff requests, history, and claim policy. Filter by status or direct parent when useful.", inputSchema: schema({ status: { type: "string", enum: ["open", "claimed", "completed"] }, parentMissionId: missionId }, []) }, run: (input: unknown) => Effect.map(SharedMissions, ({ store }) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "Invalid mission filters.", policy: store.policy }
    const value = Object.fromEntries(Object.entries(input as Record<string, unknown>).filter(([, item]) => item !== null))
    if (Object.keys(value).some((key) => !["status", "parentMissionId"].includes(key)) || (value.status !== undefined && !["open", "claimed", "completed"].includes(value.status as string)) || (value.parentMissionId !== undefined && (typeof value.parentMissionId !== "string" || !value.parentMissionId.trim()))) return { ok: false, error: "Use optional status and parentMissionId filters only.", policy: store.policy }
    return { missions: store.list(value), policy: store.policy }
  }) },
  commandTool("create_mission", "Create a child mission under a mission you currently own.", { description: text, parentMissionId: missionId }, ["description"]),
  commandTool("claim_mission", "Atomically claim an open or expired mission. Claiming a mission you own renews its expiry.", { missionId }, ["missionId"]),
  commandTool("request_handoff", "Ask the current owner to hand off a claimed mission and record the reason.", { missionId, reason: text }, ["missionId", "reason"]),
  commandTool("transfer_mission", "Transfer a mission you own to another resident.", { missionId, toResidentId: text }, ["missionId", "toResidentId"]),
  commandTool("release_mission", "Release a mission you own so another resident can claim it.", { missionId }, ["missionId"]),
  commandTool("complete_mission", "Complete a mission you own after its children are complete, citing an existing artifact.", { missionId, artifactPath: text }, ["missionId", "artifactPath"])
], "Coordinate work through the shared mission hierarchy. Claim work before acting, renew long-running claims, and complete child missions before their parent. Identity is runtime-owned.", { name: "missions" })
