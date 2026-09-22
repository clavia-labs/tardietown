import { toolSchema as schema } from "./toolSchema"
import { Context, Effect, Layer } from "effect"
import { tool } from "tardie/agent"
import { MissionStore, type MissionCommand, type MissionResult } from "../../forum/missions/store"

export type ExecuteMission = (command: MissionCommand, operationId: string) => Effect.Effect<MissionResult>
export class SharedMissions extends Context.Service<SharedMissions, { store: MissionStore; execute: ExecuteMission }>()("town/SharedMissions") {}
export const missionLayer = (store: MissionStore, execute: ExecuteMission) => Layer.succeed(SharedMissions, { store, execute })
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
    if (required.some((key) => key === "expectedRevision" ? !Number.isSafeInteger(normalized[key]) || (normalized[key] as number) < 0 : typeof normalized[key] !== "string" || (key !== "content" && !(normalized[key] as string).trim())) || Object.entries(normalized).some(([key, item]) => key !== "expectedRevision" && typeof item !== "string")) return Effect.succeed({ ok: false, error: "Invalid mission arguments. Text fields must be nonempty; expectedRevision must be a nonnegative integer.", policy: store.policy })
    return execute({ type: name, ...normalized } as MissionCommand, JSON.stringify([context.turn, context.callId]))
  })
})

export const missions = () => tool([
  { spec: { name: "list_missions", description: "List the mission hierarchy, claims, pending handoff requests, history, and claim policy. Filter by status or direct parent when useful.", inputSchema: schema({ status: { type: "string", enum: ["open", "claimed", "in_review", "completed"] }, parentMissionId: missionId }, []) }, run: (input: unknown) => Effect.map(SharedMissions, ({ store }) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "Invalid mission filters.", policy: store.policy }
    const value = Object.fromEntries(Object.entries(input as Record<string, unknown>).filter(([, item]) => item !== null))
    if (Object.keys(value).some((key) => !["status", "parentMissionId"].includes(key)) || (value.status !== undefined && !["open", "claimed", "in_review", "completed"].includes(value.status as string)) || (value.parentMissionId !== undefined && (typeof value.parentMissionId !== "string" || !value.parentMissionId.trim()))) return { ok: false, error: "Use optional status and parentMissionId filters only.", policy: store.policy }
    return { missions: store.list(value), policy: store.policy }
  }) },
  commandTool("create_mission", "Create a child mission under a mission you currently own.", { description: text, parentMissionId: missionId }, ["description"]),
  commandTool("claim_mission", "Atomically claim an open or expired mission. Claiming a mission you own renews its expiry.", { missionId }, ["missionId"]),
  commandTool("request_handoff", "Ask the current owner to hand off a claimed mission and record the reason.", { missionId, reason: text }, ["missionId", "reason"]),
  commandTool("transfer_mission", "Transfer a mission you own to another resident.", { missionId, toResidentId: text }, ["missionId", "toResidentId"]),
  commandTool("release_mission", "Release a mission you own so another resident can claim it.", { missionId }, ["missionId"]),
  commandTool("list_mission_files", "List working files in a mission workspace. Everyone can read; only the current owner can write.", { missionId }, ["missionId"]),
  commandTool("read_mission_file", "Read a working file in any mission workspace. Paths are relative, for example scratch/notes.md.", { missionId, filePath: text }, ["missionId", "filePath"]),
  commandTool("write_mission_file", "Write notes or drafts in your claimed mission workspace. Use scratch/ for working material. expectedRevision 0 creates a file; updates require the last read revision. Limits: 100 files per mission, 100000 characters per file, 2000000 characters per town. This does not publish an artifact. Editing the submitted file invalidates its review.", { missionId, filePath: text, content: { type: "string" }, expectedRevision: { type: "integer", minimum: 0 } }, ["missionId", "filePath", "content", "expectedRevision"]),
  commandTool("submit_mission", "Submit any nonempty .md file from your owned mission workspace for review after all child missions are complete. No prescribed filename. Publishes a fixed artifact revision; does not complete the mission until residents vote that the mission is complete.", { missionId, filePath: text, summary: text }, ["missionId", "filePath", "summary"]),
  commandTool("vote_mission_completion", "Vote on whether another resident has completed the mission, not merely whether its file looks good. Read the mission description and the exact submitted artifact revision with read_artifact. Independently check all requirements and sources, then vote complete or needs_work with a specific reason tied to the mission requirements. Use the current reviewId from list_missions. Votes are equal and separate from karma; one current vote per reviewer. Two complete votes (one in a two-resident town) and no unresolved needs_work votes complete the mission. Change your vote to complete only after resolving your concerns.", { missionId, reviewId: text, decision: { type: "string", enum: ["complete", "needs_work"] }, reason: text }, ["missionId", "reviewId", "decision", "reason"])
], "Coordinate work through the shared mission hierarchy. Claim work before acting, renew long-running claims, draft in mission scratch files, and submit child missions before their parent. Review others independently; never treat consensus as source verification. Identity is runtime-owned.", { name: "missions" })
