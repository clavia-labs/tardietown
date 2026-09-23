import { MissionWorkspace, type MissionFile, type MissionFileInfo, type PersistMissionFile } from "./workspace"
import { Effect } from "effect"
import type { ArtifactStore } from "../../artifacts/store"
import type { ForumCommand, ForumMessage, ForumResult } from "../../resident/components/forum"
import type { MemoryForum } from "../store"

export interface MissionRequest { residentId: string; reason: string; at: number }
export interface MissionHistory { at: number; actor: string; action: string }
export interface MissionReview { reviewId: string; reviewer: string; decision: "complete" | "needs_work"; reason: string; at: number; artifactPath: string; artifactRevision: number }
export interface Mission { id: string; description: string; parentMissionId?: string; status: "open" | "claimed" | "in_review" | "completed"; owner?: string; claimExpiresAt?: number; artifactPath?: string; artifactRevision?: number; reviewId?: string; reviewFilePath?: string; reviewFileRevision?: number; approvalsRequired: number; humanReviewRequired: boolean; reviews: readonly MissionReview[]; requests: readonly MissionRequest[]; history: readonly MissionHistory[] }
export const DEFAULT_MISSION_POLICY = Object.freeze({ claimTtlMs: 5 * 60 * 1000 })
export type MissionPolicy = typeof DEFAULT_MISSION_POLICY
export interface MissionFilter { status?: Mission["status"]; parentMissionId?: string }
export type MissionCommand =
  | { type: "create_mission"; description: string; parentMissionId?: string | null }
  | { type: "claim_mission"; missionId: string }
  | { type: "request_handoff"; missionId: string; reason: string }
  | { type: "transfer_mission"; missionId: string; toResidentId: string }
  | { type: "release_mission"; missionId: string }
  | { type: "submit_mission"; missionId: string; filePath: string; summary: string }
  | { type: "vote_mission_completion"; missionId: string; reviewId: string; decision: "complete" | "needs_work"; reason: string }
  | { type: "list_mission_files"; missionId: string }
  | { type: "read_mission_file"; missionId: string; filePath: string }
  | { type: "write_mission_file"; missionId: string; filePath: string; content: string; expectedRevision: number }
export type MissionResult = { ok: true; mission: Mission; policy: MissionPolicy; files?: readonly MissionFileInfo[]; file?: MissionFile } | { ok: false; error: string; policy: MissionPolicy; mission?: Mission }
type Changes = Partial<Pick<Mission, "status" | "owner" | "claimExpiresAt" | "artifactPath" | "artifactRevision" | "requests" | "reviewId" | "reviewFilePath" | "reviewFileRevision" | "reviews">>

export class MissionStore {
  readonly policy: MissionPolicy
  private records = new Map<string, Mission>()
  private residents: Set<string>
  private operations = new Map<string, { fingerprint: string; result: MissionResult }>()
  private listeners = new Set<() => void>()
  private revision = 0
  readonly workspace: MissionWorkspace

  restoreHistory(missions: readonly Mission[]) { this.records = new Map(missions.map(mission => [mission.id, this.freeze(mission)])) }
  constructor(private board: MemoryForum, rootPostId: string, residentIds: readonly string[], private artifacts: ArtifactStore, policy: Partial<MissionPolicy> = {}, private now: () => number = Date.now, persistFile?: PersistMissionFile) {
    this.workspace = new MissionWorkspace(persistFile)
    this.policy = Object.freeze({ ...DEFAULT_MISSION_POLICY, ...policy })
    if (!Number.isSafeInteger(this.policy.claimTtlMs) || this.policy.claimTtlMs < 1) throw Error("claimTtlMs must be a positive integer.")
    this.residents = new Set(residentIds)
    if (!this.residents.size || this.residents.size !== residentIds.length || [...this.residents].some((id) => !id.trim())) throw Error("Resident IDs must be nonempty and unique.")
    const root = board.snapshot().find((message) => message.id === rootPostId && message.parentId === undefined)
    if (!root) throw Error("The root mission must be an existing forum thread.")
    this.records.set(root.id, this.freeze({ id: root.id, description: root.body, status: "open", approvalsRequired: Math.max(1, this.residents.size - 1), humanReviewRequired: this.residents.size === 1, reviews: [], requests: [], history: [{ at: this.now(), actor: "runtime", action: "created" }] }))
    board.registerMissionResolver((id) => this.records.get(id))
  }

  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  version = () => this.revision
  list = (filter: MissionFilter = {}): readonly Mission[] => [...this.records.values()].filter((mission) => (filter.status === undefined || mission.status === filter.status) && (filter.parentMissionId === undefined || mission.parentMissionId === filter.parentMissionId))
  nextExpiry = (): number | undefined => this.list().reduce<number | undefined>((next, mission) => mission.status === "claimed" && mission.claimExpiresAt !== undefined && (next === undefined || mission.claimExpiresAt < next) ? mission.claimExpiresAt : next, undefined)

  expire(): void {
    const at = this.now(); let changed = false
    for (const mission of this.records.values()) if (mission.status === "claimed" && mission.claimExpiresAt !== undefined && mission.claimExpiresAt <= at) {
      this.records.set(mission.id, this.update(mission, { status: "open", requests: [] }, { at, actor: "runtime", action: "claim_expired" }, ["owner", "claimExpiresAt", "reviewId"])); changed = true
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
    if (!this.residents.has(author) && !(author === "user" && command.type === "vote_mission_completion" && this.residents.size === 1)) return this.fail("Unknown resident.")
    const at = this.now()
    if (command.type === "create_mission") {
      if (!command.description.trim()) return this.fail("A mission description is required.")
      if (!command.parentMissionId) return this.fail("Residents must create missions under an existing parent mission.")
      const parent = this.records.get(command.parentMissionId)
      if (!parent) return this.fail("Parent mission not found.")
      if (parent.status !== "claimed") return this.fail("The parent mission must be actively claimed to add child tasks.", parent)
      if (parent.owner !== author) return this.fail("Only the current owner may create child missions.", parent)
      const posted = this.forum(author, { kind: "create_post", title: "Child mission", body: command.description.trim() }, `${operationId}:create`)
      if (!posted.ok || posted.kind !== "create_post") return this.fail(posted.ok ? "The forum did not create the child mission." : posted.message)
      const mission = this.freeze({ id: posted.message.id, description: posted.message.body, parentMissionId: parent.id, status: "open", approvalsRequired: Math.max(1, this.residents.size - 1), humanReviewRequired: this.residents.size === 1, reviews: [], requests: [], history: [{ at, actor: author, action: "created" }] })
      this.records.set(mission.id, mission); this.changed(); return this.success(mission)
    }
    const mission = this.records.get(command.missionId)
    if (!mission) return this.fail("Mission not found.")
    if (command.type === "list_mission_files") return { ...this.success(mission), files: this.workspace.list(mission.id) }
    if (command.type === "read_mission_file") {
      const file = this.workspace.read(mission.id, command.filePath)
      return file ? { ...this.success(mission), file } : this.fail("Workspace file not found.", mission)
    }
    if (mission.status === "completed") return this.fail("Completed missions cannot be changed.", mission)
    if (command.type === "vote_mission_completion") {
      if (mission.status !== "in_review" || command.reviewId !== mission.reviewId) return this.fail("This review is no longer current. Read the mission again.", mission)
      if (author === mission.owner) return this.fail("Owners cannot vote on completion of their own mission.", mission)
      if (mission.humanReviewRequired !== (author === "user")) return this.fail("This mission requires a review from " + (mission.humanReviewRequired ? "the user." : "another resident."), mission)
      if (!["complete", "needs_work"].includes(command.decision) || !command.reason.trim()) return this.fail("Choose complete or needs_work and give a reason tied to the mission requirements.", mission)
      if (!this.artifacts.hasRead(author, mission.artifactPath!, mission.artifactRevision!)) return this.fail("Read the exact submitted artifact revision before reviewing it.", mission)
      const previousVote = mission.reviews.findLast(vote => vote.reviewId === command.reviewId && vote.reviewer === author)
      if (previousVote?.decision === command.decision && previousVote.reason === command.reason.trim()) return this.success(mission)
      const review: MissionReview = { reviewId: command.reviewId, reviewer: author, decision: command.decision, reason: command.reason.trim(), at, artifactPath: mission.artifactPath!, artifactRevision: mission.artifactRevision! }
      const reviews = [...mission.reviews, review]
      const latest = new Map(reviews.filter(vote => vote.reviewId === mission.reviewId).map(vote => [vote.reviewer, vote]))
      const complete = [...latest.values()].filter(vote => vote.decision === "complete").length >= mission.approvalsRequired && ![...latest.values()].some(vote => vote.decision === "needs_work")
      return this.save(this.update(mission, { reviews, status: complete ? "completed" : "in_review" }, { at, actor: author, action: complete ? "completed" : `reviewed:${command.decision}` }))
    }
    if (command.type === "claim_mission") {
      if (mission.status === "in_review") return this.fail("This mission is awaiting review; its ownership is retained.", mission)
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
      return this.save(this.update(mission, { owner: command.toResidentId, status: "claimed", claimExpiresAt: at + this.policy.claimTtlMs, requests: [] }, { at, actor: author, action: `transferred:${command.toResidentId}` }, ["reviewId"]))
    }
    if (command.type === "release_mission") return this.save(this.update(mission, { status: "open", requests: [] }, { at, actor: author, action: "released" }, ["owner", "claimExpiresAt", "reviewId"]))
    if (command.type === "write_mission_file") {
      const result = this.workspace.write(mission.id, author, command.filePath, command.content, command.expectedRevision, at)
      if (!result.ok) return this.fail(result.error, mission)
      const invalidatesReview = mission.status === "in_review" && mission.reviewFilePath === command.filePath
      const updated = this.update(mission, invalidatesReview ? { status: "claimed", claimExpiresAt: at + this.policy.claimTtlMs } : {}, { at, actor: author, action: invalidatesReview ? "review_invalidated" : `file_written:${command.filePath}` }, invalidatesReview ? ["reviewId"] : [])
      this.save(updated)
      return { ...this.success(updated), file: result.file }
    }
    const file = this.workspace.read(mission.id, command.filePath)
    if (!file || !file.path.endsWith(".md") || !file.content.trim()) return this.fail("Submit a nonempty Markdown file from this mission's workspace. Any .md filename is allowed.", mission)
    if (!command.summary.trim()) return this.fail("A submission summary is required.", mission)
    if ([...this.records.values()].some((child) => child.parentMissionId === mission.id && child.status !== "completed")) return this.fail("Complete all child missions first.", mission)
    if (mission.status === "in_review" && mission.reviewFilePath === file.path && mission.reviewFileRevision === file.revision) return this.success(mission)
    const path = `/missions/${mission.id}/${file.path}`
    const result = this.artifacts.publish(author, `mission:${mission.id}:${operationId}`, { path, content: file.content, summary: command.summary, expectedRevision: this.artifacts.read(path)?.revision ?? 0 })
    if (!result.ok) return this.fail(result.error, mission)
    return this.save(this.update(mission, { status: "in_review", artifactPath: path, artifactRevision: result.artifact.revision, reviewId: crypto.randomUUID(), reviewFilePath: file.path, reviewFileRevision: file.revision, requests: [] }, { at, actor: author, action: "review_submitted" }, ["claimExpiresAt"]))
  }

  private forum(author: string, command: ForumCommand, operationId: string): ForumResult { return Effect.runSync(this.board.bind(author).execute(command, operationId)) }
  private update(mission: Mission, changes: Changes, event: MissionHistory, remove: readonly (keyof Mission)[] = []): Mission { const value: Record<string, unknown> = { ...mission, ...changes, history: [...mission.history, event] }; remove.forEach((key) => delete value[key]); return this.freeze(value as unknown as Mission) }
  private freeze(mission: Mission): Mission { return Object.freeze({ ...mission, reviews: Object.freeze(mission.reviews.map(value => Object.freeze({ ...value }))), requests: Object.freeze(mission.requests.map((value) => Object.freeze({ ...value }))), history: Object.freeze(mission.history.map((value) => Object.freeze({ ...value }))) }) }
  private save(mission: Mission): MissionResult { this.records.set(mission.id, mission); this.changed(); return this.success(mission) }
  private changed(): void { this.revision++; this.listeners.forEach((listener) => listener()) }
  private success(mission: Mission): Extract<MissionResult, { ok: true }> { return { ok: true, mission, policy: this.policy } }
  private fail(error: string, mission?: Mission): MissionResult { return mission ? { ok: false, error, policy: this.policy, mission } : { ok: false, error, policy: this.policy } }
}
