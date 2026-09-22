import { Effect } from "effect"
import type { ArtifactStore } from "../artifacts/store"
import type { ForumCommand, ForumMessage, ForumResult } from "../../forum/component"
import type { MemoryForum } from "../../forum/store"

export interface MissionRequest { residentId: string; reason: string; at: number }
export interface MissionHistory { at: number; actor: string; action: string }
export interface Mission { id: string; description: string; parentMissionId?: string; status: "open" | "claimed" | "completed"; owner?: string; claimExpiresAt?: number; artifactPath?: string; artifactRevision?: number; requests: readonly MissionRequest[]; history: readonly MissionHistory[] }
export const DEFAULT_MISSION_POLICY = Object.freeze({ claimTtlMs: 5 * 60 * 1000 })
export type MissionPolicy = typeof DEFAULT_MISSION_POLICY
export interface MissionFilter { status?: Mission["status"]; parentMissionId?: string }
export type MissionCommand =
  | { type: "create_mission"; description: string; parentMissionId?: string | null }
  | { type: "claim_mission"; missionId: string }
  | { type: "request_handoff"; missionId: string; reason: string }
  | { type: "transfer_mission"; missionId: string; toResidentId: string }
  | { type: "release_mission"; missionId: string }
  | { type: "complete_mission"; missionId: string; artifactPath: string }
export type MissionResult = { ok: true; mission: Mission; policy: MissionPolicy } | { ok: false; error: string; policy: MissionPolicy; mission?: Mission }
type Changes = Partial<Pick<Mission, "status" | "owner" | "claimExpiresAt" | "artifactPath" | "artifactRevision" | "requests">>

export class MissionStore {
  readonly policy: MissionPolicy
  private records = new Map<string, Mission>()
  private residents: Set<string>
  private operations = new Map<string, { fingerprint: string; result: MissionResult }>()
  private listeners = new Set<() => void>()
  private revision = 0

  constructor(private board: MemoryForum, rootPostId: string, residentIds: readonly string[], private artifacts: ArtifactStore, policy: Partial<MissionPolicy> = {}, private now: () => number = Date.now) {
    this.policy = Object.freeze({ ...DEFAULT_MISSION_POLICY, ...policy })
    if (!Number.isSafeInteger(this.policy.claimTtlMs) || this.policy.claimTtlMs < 1) throw Error("claimTtlMs must be a positive integer.")
    this.residents = new Set(residentIds)
    if (!this.residents.size || this.residents.size !== residentIds.length || [...this.residents].some((id) => !id.trim())) throw Error("Resident IDs must be nonempty and unique.")
    const root = board.snapshot().find((message) => message.id === rootPostId && message.parentId === undefined)
    if (!root) throw Error("The root mission must be an existing forum thread.")
    this.records.set(root.id, this.freeze({ id: root.id, description: root.body, status: "open", requests: [], history: [{ at: this.now(), actor: "runtime", action: "created" }] }))
    board.registerMissionResolver((id) => this.records.get(id))
  }

  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  version = () => this.revision
  list = (filter: MissionFilter = {}): readonly Mission[] => [...this.records.values()].filter((mission) => (filter.status === undefined || mission.status === filter.status) && (filter.parentMissionId === undefined || mission.parentMissionId === filter.parentMissionId))
  nextExpiry = (): number | undefined => this.list().reduce<number | undefined>((next, mission) => mission.status === "claimed" && mission.claimExpiresAt !== undefined && (next === undefined || mission.claimExpiresAt < next) ? mission.claimExpiresAt : next, undefined)

  expire(): void {
    const at = this.now(); let changed = false
    for (const mission of this.records.values()) if (mission.status === "claimed" && mission.claimExpiresAt !== undefined && mission.claimExpiresAt <= at) {
      this.records.set(mission.id, this.update(mission, { status: "open", requests: [] }, { at, actor: "runtime", action: "claim_expired" }, ["owner", "claimExpiresAt"])); changed = true
    }
    if (changed) this.changed()
  }

  execute(author: string, operationId: string, command: MissionCommand): MissionResult {
    if (!operationId) return this.fail("A nonempty operation ID is required.")
    const key = JSON.stringify([author, operationId]), fingerprint = JSON.stringify(command), prior = this.operations.get(key)
    if (prior) return prior.fingerprint === fingerprint ? prior.result : this.fail("Operation ID already used with different arguments.")
    this.expire()
    const result = this.apply(author, operationId, command)
    this.operations.set(key, { fingerprint, result })
    return result
  }

  private apply(author: string, operationId: string, command: MissionCommand): MissionResult {
    if (!this.residents.has(author)) return this.fail("Unknown resident.")
    const at = this.now()
    if (command.type === "create_mission") {
      if (!command.description.trim()) return this.fail("A mission description is required.")
      if (!command.parentMissionId) return this.fail("Residents must create missions under an existing parent mission.")
      const parent = this.records.get(command.parentMissionId)
      if (!parent) return this.fail("Parent mission not found.")
      if (parent.status === "completed") return this.fail("Completed missions cannot be changed.", parent)
      if (parent.owner !== author) return this.fail("Only the current owner may create child missions.", parent)
      const posted = this.forum(author, { kind: "create_post", title: "Child mission", body: command.description.trim() }, `${operationId}:create`)
      if (!posted.ok || posted.kind !== "create_post") return this.fail(posted.ok ? "The forum did not create the child mission." : posted.message)
      const mission = this.freeze({ id: posted.message.id, description: posted.message.body, parentMissionId: parent.id, status: "open", requests: [], history: [{ at, actor: author, action: "created" }] })
      this.records.set(mission.id, mission); this.changed(); return this.success(mission)
    }
    const mission = this.records.get(command.missionId)
    if (!mission) return this.fail("Mission not found.")
    if (mission.status === "completed") return this.fail("Completed missions cannot be changed.", mission)
    if (command.type === "claim_mission") {
      if (mission.owner && mission.owner !== author) return this.fail("Mission is already claimed.", mission)
      return this.save(this.update(mission, { status: "claimed", owner: author, claimExpiresAt: at + this.policy.claimTtlMs }, { at, actor: author, action: mission.owner === author ? "claim_renewed" : "claimed" }))
    }
    if (command.type === "request_handoff") {
      if (!command.reason.trim()) return this.fail("A handoff reason is required.", mission)
      if (!mission.owner) return this.fail("Claim the unowned mission instead of requesting a handoff.", mission)
      if (mission.owner === author) return this.fail("Owners cannot request a handoff from themselves.", mission)
      if (mission.requests.some((request) => request.residentId === author)) return this.fail("You already have a pending handoff request.", mission)
      const read = this.forum(author, { kind: "read_board", threadId: mission.id }, `${operationId}:read`)
      if (!read.ok) return this.fail(read.message, mission)
      const reason = command.reason.trim(), reply = this.forum(author, { kind: "reply", parentId: mission.id, body: reason }, `${operationId}:reply`)
      if (!reply.ok) return this.fail(reply.message, mission)
      return this.save(this.update(mission, { requests: [...mission.requests, { residentId: author, reason, at }] }, { at, actor: author, action: `handoff_requested:${reason}` }))
    }
    if (mission.owner !== author) return this.fail("Only the current owner may change this mission.", mission)
    if (command.type === "transfer_mission") {
      if (!this.residents.has(command.toResidentId)) return this.fail("Transfer target is not a resident.", mission)
      if (command.toResidentId === author) return this.fail("A mission cannot be transferred to its current owner.", mission)
      return this.save(this.update(mission, { owner: command.toResidentId, status: "claimed", claimExpiresAt: at + this.policy.claimTtlMs, requests: [] }, { at, actor: author, action: `transferred:${command.toResidentId}` }))
    }
    if (command.type === "release_mission") return this.save(this.update(mission, { status: "open", requests: [] }, { at, actor: author, action: "released" }, ["owner", "claimExpiresAt"]))
    const artifact = this.artifacts.read(command.artifactPath)
    if (!artifact) return this.fail("Completion requires an existing artifact.", mission)
    if ([...this.records.values()].some((child) => child.parentMissionId === mission.id && child.status !== "completed")) return this.fail("Complete all child missions first.", mission)
    return this.save(this.update(mission, { status: "completed", artifactPath: artifact.path, artifactRevision: artifact.revision, requests: [] }, { at, actor: author, action: "completed" }, ["claimExpiresAt"]))
  }

  private forum(author: string, command: ForumCommand, operationId: string): ForumResult { return Effect.runSync(this.board.bind(author).execute(command, operationId)) }
  private update(mission: Mission, changes: Changes, event: MissionHistory, remove: readonly (keyof Mission)[] = []): Mission { const value: Record<string, unknown> = { ...mission, ...changes, history: [...mission.history, event] }; remove.forEach((key) => delete value[key]); return this.freeze(value as unknown as Mission) }
  private freeze(mission: Mission): Mission { return Object.freeze({ ...mission, requests: Object.freeze(mission.requests.map((value) => Object.freeze({ ...value }))), history: Object.freeze(mission.history.map((value) => Object.freeze({ ...value }))) }) }
  private save(mission: Mission): MissionResult { this.records.set(mission.id, mission); this.changed(); return this.success(mission) }
  private changed(): void { this.revision++; this.listeners.forEach((listener) => listener()) }
  private success(mission: Mission): MissionResult { return { ok: true, mission, policy: this.policy } }
  private fail(error: string, mission?: Mission): MissionResult { return mission ? { ok: false, error, policy: this.policy, mission } : { ok: false, error, policy: this.policy } }
}
