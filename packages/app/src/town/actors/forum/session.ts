import type { Resident } from "../../world"
import type { ForumMessage } from "../resident/components/forum"
import { MemoryForum } from "./store"
import type { Mission, MissionStore } from "../../workspace/missions/store"

export const DEFAULT_FORUM_CONCURRENCY = 2
export interface ForumSessionState {
  readonly running: boolean
  readonly thinking: readonly string[]
  readonly pending: number
  readonly turns: number
  readonly limit: number
  readonly error?: string
}
export interface ForumConnection {
  wake: (
    resident: Resident,
    notification: string,
    residents: readonly Resident[],
    signal: AbortSignal
  ) => Promise<unknown>
  close: () => Promise<void>
}

// ForumSession routes board activity as actor messages; the host owns the queue.
export class ForumSession {
  private state: ForumSessionState
  private readonly listeners = new Set<() => void>()
  private readonly calls = new Map<AbortController, Promise<void>>()
  private readonly unsubscribe: () => void
  private readonly unsubscribeMissions?: () => void
  private missionSnapshot: readonly Mission[] = []
  private started = false
  private closed = false
  constructor(
    readonly board: MemoryForum,
    readonly residents: readonly Resident[],
    readonly connection: ForumConnection,
    limit: number,
    readonly missions?: MissionStore
  ) {
    if (!Number.isSafeInteger(limit) || limit < residents.length)
      throw new Error("Turn budget must cover each duck's mission message.")
    this.state = { running: false, thinking: [], pending: 0, turns: 0, limit }
    this.unsubscribe = board.subscribe((message) => this.notify(message))
    if (missions) {
      this.missionSnapshot = missions.list()
      this.unsubscribeMissions = missions.subscribe(() =>
        this.notifyMissionChanges()
      )
    }
  }
  snapshot = () => this.state
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
    if (
      this.closed ||
      !this.state.running ||
      this.state.turns >= this.state.limit
    )
      return
    const abort = new AbortController()
    this.update({
      turns: this.state.turns + 1,
      pending: this.state.pending + 1
    })
    const job = this.connection
      .wake(resident, notification, this.residents, abort.signal)
      .then(
        () => {},
        (error: unknown) => {
          if (!abort.signal.aborted) {
            this.update({
              error: error instanceof Error ? error.message : String(error)
            })
            this.pause()
          }
        }
      )
      .finally(() => {
        this.calls.delete(abort)
        this.update({ pending: this.state.pending - 1 })
        if (this.state.pending === 0 && this.state.turns >= this.state.limit)
          this.update({ running: false })
      })
    this.calls.set(abort, job)
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
    const { error: _error, ...state } = this.state
    this.state = {
      ...state,
      running: true,
      limit: state.limit + additionalTurns
    }
    const notification = this.started
      ? "The colony resumed. Read unread board activity and decide whether to participate."
      : "The colony mission is starting. Read the board and decide how to participate."
    this.started = true
    this.residents.forEach((resident) => this.send(resident, notification))
    this.update({})
  }
  pause() {
    this.update({ running: false })
    this.calls.forEach((_, abort) => abort.abort())
  }
  async close() {
    this.closed = true
    this.pause()
    this.unsubscribe()
    this.unsubscribeMissions?.()
    await Promise.allSettled(this.calls.values())
    await this.connection.close()
    this.listeners.clear()
  }
}
