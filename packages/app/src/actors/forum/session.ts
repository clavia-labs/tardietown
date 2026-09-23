import type { TownBudget, SpendState } from "../../town/budget"
import type { Resident } from "../../town/world"
import type { ForumMessage } from "../resident/components/forum"
import { MemoryForum } from "./store"
import type { Mission, MissionStore } from "./missions/store"

export const DEFAULT_FORUM_CONCURRENCY = 2
export interface ForumSessionState {
  readonly running: boolean
  readonly thinking: readonly string[]
  readonly pending: number
  readonly turns: number
  readonly limit: number
  readonly spend?: SpendState
  readonly errorId?: string
  readonly error?: string
}
export interface ForumConnection {
  wake: (
    resident: Resident,
    notification: string,
    residents: readonly Resident[],
    signal: AbortSignal,
    budgetUsd?: number
  ) => Promise<unknown>
  close: () => Promise<void>
}

export interface ForumSchedulerOptions {
  readonly maxConcurrent?: number
  readonly budget?: TownBudget
  readonly random?: () => number
}
interface PendingWake {
  readonly resident: Resident
  readonly notification: string
  readonly updates: number
}

// Keep one pending wake per resident; select the next turn using current karma.
// Negative karma retains a chance, and positive influence is capped.
export const karmaWeight = (karma: number) => 1 + Math.min(10, Math.max(0, karma))
export class ForumSession {
  private state: ForumSessionState
  private readonly listeners = new Set<() => void>()
  private readonly calls = new Map<string, { abort: AbortController; job: Promise<void> }>()
  private readonly waiting = new Map<string, PendingWake>()
  private readonly maxConcurrent: number
  private readonly budget: TownBudget | undefined
  private readonly random: () => number
  private drainScheduled = false
  private readonly unsubscribe: () => void
  private readonly unsubscribeMissions?: () => void
  private missionSnapshot: readonly Mission[] = []
  private humanWaiting = new Set<string>()
  setHumanWaiting = (residents: readonly string[]) => { this.humanWaiting = new Set(residents); this.scheduleDrain() }
  notifyHuman = (id: string, notification: string) => { const resident = this.residents.find(resident => resident.id === id); if (resident) this.send(resident, notification) }
  private started = false
  private closed = false
  constructor(
    readonly board: MemoryForum,
    readonly residents: readonly Resident[],
    readonly connection: ForumConnection,
    limit: number,
    readonly missions?: MissionStore,
    scheduler: ForumSchedulerOptions = {}
  ) {
    if (!Number.isSafeInteger(limit) || limit < residents.length)
      throw new Error("Turn budget must cover each duck's mission message.")
    this.maxConcurrent = scheduler.maxConcurrent ?? DEFAULT_FORUM_CONCURRENCY
    if (!Number.isSafeInteger(this.maxConcurrent) || this.maxConcurrent < 1)
      throw new Error("Concurrency must be a positive integer.")
    this.budget = scheduler.budget
    this.random = scheduler.random ?? Math.random
    this.state = { running: false, thinking: [], pending: 0, turns: 0, limit }
    this.unsubscribe = board.subscribe((event) => {
      if (event.type === "MessagePosted") this.notify(event.message)
      // Votes change the next lottery's weights without creating new work.
    })
    if (missions) {
      this.missionSnapshot = missions.list()
      this.unsubscribeMissions = missions.subscribe(() =>
        this.notifyMissionChanges()
      )
    }
  }
  restoreState(saved: ForumSessionState) {
    this.started = true
    this.state = { running: false, thinking: [], pending: 0, turns: saved.turns, limit: saved.limit }
  }
  snapshot = () => ({ ...this.state, ...(this.budget ? { spend: this.budget.snapshot() } : {}) })
  budgetChanged = () => { this.update({}); this.scheduleDrain() }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  private update(patch: Partial<ForumSessionState>) {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach((listener) => listener())
  }
  thinking = (id: string, active: boolean) => {
    const next = new Set(this.state.thinking)
    if (active) next.add(id)
    else next.delete(id)
    this.update({ thinking: [...next] })
  }
  private send(resident: Resident, notification: string) {
    if (this.closed) return
    const previous = this.waiting.get(resident.id)
    this.waiting.set(resident.id, {
      resident,
      notification,
      updates: (previous?.updates ?? 0) + 1
    })
    this.updatePending()
    this.scheduleDrain()
  }
  private updatePending() {
    this.update({ pending: this.calls.size + this.waiting.size })
  }
  private scheduleDrain() {
    if (this.closed || !this.state.running || this.drainScheduled) return
    this.drainScheduled = true
    // Collect the entire broadcast before choosing, rather than admitting the
    // first residents in roster order as notifications arrive.
    queueMicrotask(() => {
      this.drainScheduled = false
      this.drain()
    })
  }
  private drain() {
    while (
      !this.closed && this.state.running &&
      this.calls.size < this.maxConcurrent && (this.budget ? this.budget.available() > 0.000001 : this.state.turns < this.state.limit)
    ) {
      const eligible = [...this.waiting.values()].filter(({ resident }) => !this.calls.has(resident.id) && !this.humanWaiting.has(resident.id))
      if (!eligible.length) break
      const karma = this.board.karma()
      const weights = eligible.map(({ resident }) => karmaWeight(karma[resident.id] ?? 0))
      let ticket = this.random() * weights.reduce((sum, weight) => sum + weight, 0)
      let selected = eligible[eligible.length - 1]!
      for (let index = 0; index < eligible.length; index++) {
        ticket -= weights[index]!
        if (ticket < 0) { selected = eligible[index]!; break }
      }
      this.waiting.delete(selected.resident.id)
      this.start(selected)
    }
    if (!this.calls.size && (this.budget ? this.budget.available() <= 0.000001 : this.state.turns >= this.state.limit))
      this.update({ running: false })
  }
  private start({ resident, notification, updates }: PendingWake) {
    const budgetUsd = this.budget?.reserve(resident.id)
    const abort = new AbortController()
    const text = updates === 1 ? notification
      : `${updates} updates are waiting. Read unread forum activity and list missions to catch up. Latest update: ${notification}`
    const job = Promise.resolve()
      .then(() => {
        abort.signal.throwIfAborted()
        this.thinking(resident.id, true)
        return this.connection.wake(resident, text, this.residents, abort.signal, budgetUsd)
      })
      .then(
        result => {
          if (result === "TOWN_SPEND_ALLOWANCE_EXHAUSTED") this.send(resident, "Continue your interrupted work. Read the forum and mission workspace first.")
        },
        (error: unknown) => {
          if (!abort.signal.aborted) {
            this.update({ errorId: crypto.randomUUID(), error: error instanceof Error ? error.message : String(error) })
            this.pause()
          }
        }
      )
      .finally(() => {
        this.calls.delete(resident.id)
        this.thinking(resident.id, false)
        this.updatePending()
        this.scheduleDrain()
      })
    this.calls.set(resident.id, { abort, job })
    // A queued notification costs nothing until it gets an execution slot.
    this.update({ turns: this.state.turns + 1, pending: this.calls.size + this.waiting.size })
  }
  private notify(message: ForumMessage) {
    const participants = new Set(
      this.board
        .snapshot()
        .filter((post) => post.threadId === message.threadId)
        .map((post) => post.author)
    )
    for (const resident of this.residents) {
      if (
        resident.id !== message.author &&
        (!message.parentId || participants.has(resident.id))
      )
        this.send(
          resident,
          `New ${message.parentId ? "reply" : "thread"}: message ${message.id}, thread ${message.threadId}. Read the relevant thread; reply if you have something useful to add, vote on contributions, or acknowledge silently.`
        )
    }
  }
  private notifyMissionChanges() {
    if (!this.missions) return
    const before = new Map(this.missionSnapshot.map((mission) => [mission.id, mission]))
    const next = this.missions.list()
    this.missionSnapshot = next
    for (const mission of next) {
      const previous = before.get(mission.id)
      if (!previous) continue
      const event = mission.history.at(-1)
      if (!event || previous.history.length === mission.history.length) continue
      if (event.action === "review_submitted") {
        for (const resident of this.residents) if (resident.id !== mission.owner)
          this.send(resident, `Mission ${mission.id} is ready for a completion vote. Read the mission description and ${mission.artifactPath} revision ${mission.artifactRevision} with read_artifact, independently verify whether the mission requirements are fulfilled using the submission and its sources, then vote complete or needs_work using vote_mission_completion with reviewId ${mission.reviewId}. Give a specific reason. Do not vote based only on other reviewers' opinions.`)
        continue
      }
      if ((event.action.startsWith("reviewed:") || event.action === "review_invalidated" || event.action === "completed") && mission.owner && mission.owner !== event.actor) {
        const owner = this.residents.find(resident => resident.id === mission.owner)
        if (owner) this.send(owner, `Mission ${mission.id}: ${event.action}. List missions to read reviews. Address requested changes in your mission workspace and submit the revised file for a fresh review.`)
      }
      if (event.action === "released" || event.action === "claim_expired") {
        for (const resident of this.residents)
          if (resident.id !== event.actor)
            this.send(
              resident,
              `Mission ${mission.id} is available after its claim was ${event.action === "released" ? "released" : "expired"}. List missions and claim it only if you can take responsibility for its deliverable.`
            )
        continue
      }
      if (event.action.startsWith("handoff_requested:") && mission.owner) {
        const owner = this.residents.find(({ id }) => id === mission.owner)
        const participants = new Set(
          this.board
            .snapshot()
            .filter(({ threadId }) => threadId === mission.id)
            .map(({ author }) => author)
        )
        if (owner && !participants.has(owner.id))
          this.send(
            owner,
            `A resident requested a handoff of mission ${mission.id}. Read its forum thread and decide whether to transfer the mission.`
          )
        continue
      }
      if (event.action.startsWith("transferred:") && mission.owner) {
        const resident = this.residents.find(({ id }) => id === mission.owner)
        if (resident)
          this.send(
            resident,
            `Mission ${mission.id} was transferred to you. Read its forum thread and mission record before continuing the work.`
          )
        continue
      }
      if (event.action === "completed" && mission.parentMissionId) {
        const parent = next.find(({ id }) => id === mission.parentMissionId)
        const resident = this.residents.find(({ id }) => id === parent?.owner)
        if (resident && resident.id !== event.actor)
          this.send(
            resident,
            `Child mission ${mission.id} is complete. Read its linked artifact and synthesize it into parent mission ${mission.parentMissionId}.`
          )
      }
    }
  }
  resume(additionalTurns = 0) {
    if (this.closed) return
    if (!Number.isSafeInteger(additionalTurns) || additionalTurns < 0)
      throw new Error("Additional turns must be a nonnegative integer.")
    const { error: _error, errorId: _errorId, ...state } = this.state
    this.state = {
      ...state,
      running: true,
      limit: state.limit + additionalTurns
    }
    const notification = this.started
      ? "The town resumed. Read unread board activity and decide whether to participate."
      : "The town mission is starting. Read the board and decide how to participate."
    this.started = true
    this.residents.forEach((resident) => this.send(resident, notification))
    this.update({})
  }
  pause() {
    this.update({ running: false })
    this.calls.forEach(({ abort }, id) => {
      // Keep interrupted work eligible, but wait for the old call to settle
      // before allowing that resident to run again after resume.
      const resident = this.residents.find((resident) => resident.id === id)
      if (resident) this.send(resident, "Your previous turn was interrupted. Read unread forum activity and list missions before continuing.")
      abort.abort()
    })
  }
  async close() {
    this.closed = true
    this.pause()
    this.unsubscribe()
    this.unsubscribeMissions?.()
    this.waiting.clear()
    this.updatePending()
    await Promise.allSettled([...this.calls.values()].map(({ job }) => job))
    await this.connection.close()
    this.listeners.clear()
  }
}
