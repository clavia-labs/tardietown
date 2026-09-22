import { Clock, Effect, Layer } from "effect"
import {
  Forum,
  decodeForumCommand,
  type ForumCommand,
  type ForumMessage,
  type ForumPolicy,
  type ForumResult,
  type ForumService
} from "../agent/components/forum"

export const DEFAULT_FORUM_POLICY: ForumPolicy = Object.freeze({
  pageSize: 20,
  maxPageSize: 100,
  maxTitleCharacters: 160,
  maxBodyCharacters: 8000,
  maxAcknowledgments: 100
})

// MemoryForum retains public messages and author-private read state for one in-memory forum.
export class MemoryForum {
  private missionResolver: ((messageId: string) => import("../workspace/missions/store").Mission | undefined) | undefined
  private readonly votes = new Map<string, Map<string, number>>()
  private readonly changes = new Set<() => void>()
  subscribeChanges = (listener: () => void) => {
    this.changes.add(listener)
    return () => { this.changes.delete(listener) }
  }
  private score(id: string) {
    return [...(this.votes.get(id)?.values() ?? [])].reduce((sum, vote) => sum + vote, 0)
  }
  readonly policy: ForumPolicy
  private readonly listeners = new Set<(message: ForumMessage) => void>()
  private revision = 0
  subscribe(listener: (message: ForumMessage) => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  version = () => this.revision
  registerMissionResolver(resolver: (messageId: string) => import("../workspace/missions/store").Mission | undefined) {
    this.missionResolver = resolver
    return () => { if (this.missionResolver === resolver) this.missionResolver = undefined }
  }
  private decorate(message: ForumMessage): ForumMessage {
    const mission = message.parentId === undefined ? this.missionResolver?.(message.id) : undefined
    return Object.freeze({ ...message, score: this.score(message.id), ...(mission ? { mission } : {}) })
  }
  private readonly messages: ForumMessage[] = []
  private readonly seen = new Map<string, Set<string>>()
  private readonly handled = new Map<string, Set<string>>()
  private readonly operations = new Map<
    string,
    { fingerprint: string; result: ForumResult }
  >()

  constructor(policy: Partial<ForumPolicy> = {}) {
    this.policy = Object.freeze({ ...DEFAULT_FORUM_POLICY, ...policy })
    if (
      Object.values(this.policy).some(
        (value) => !Number.isSafeInteger(value) || value < 1
      ) ||
      this.policy.pageSize > this.policy.maxPageSize
    )
      throw new Error(
        "Forum limits must be positive safe integers and pageSize must not exceed maxPageSize."
      )
  }

  // bind supplies identity outside model arguments and reads time from the Effect clock.
  bind(author: string): ForumService {
    if (!author.trim()) throw new Error("Forum author must not be empty.")
    return {
      execute: (command, operationId) =>
        Effect.map(Clock.currentTimeMillis, (at) =>
          this.apply(author, command, operationId, at)
        )
    }
  }

  // snapshot returns public messages without private acknowledgments.
  snapshot(): readonly ForumMessage[] {
    return this.messages.map((message) => this.decorate(message))
  }

  private apply(
    author: string,
    command: ForumCommand,
    operationId: string,
    at: number
  ): ForumResult {
    const invalid = (message: string): ForumResult => ({
      ok: false,
      code: "invalid_input",
      message
    })
    const { kind, ...input } = command
    const decoded = decodeForumCommand(kind, input)
    if (!decoded || !operationId)
      return invalid("A valid command and nonempty operation ID are required.")
    command = decoded
    const key = JSON.stringify([author, operationId])
    const fingerprint = JSON.stringify(command, Object.keys(command).sort())
    const previous = this.operations.get(key)
    if (previous)
      return previous.fingerprint === fingerprint
        ? previous.result
        : {
            ok: false,
            code: "operation_conflict",
            message:
              "This operation ID was already used with different arguments."
          }
    const seen = this.seen.get(author) ?? new Set<string>()
    const handled = this.handled.get(author) ?? new Set<string>()
    this.seen.set(author, seen)
    this.handled.set(author, handled)
    const result = (): ForumResult => {
      if (command.kind === "read_board") {
        if (
          command.threadId !== undefined &&
          !this.messages.some(
            (message) =>
              message.id === command.threadId && message.parentId === undefined
          )
        )
          return {
            ok: false,
            code: "not_found",
            message: "Thread does not exist."
          }
        const through = command.through ?? this.messages.length
        const after = command.after ?? 0
        if (through > this.messages.length || after > through)
          return invalid(
            "Cursors must satisfy 0 <= after <= through <= the current board sequence."
          )
        const effectiveLimit = Math.min(
          command.limit ?? this.policy.pageSize,
          this.policy.maxPageSize
        )
        const matching = this.messages.filter(
          (message) =>
            message.sequence > after &&
            message.sequence <= through &&
            (command.threadId === undefined ||
              message.threadId === command.threadId) &&
            (!command.unreadOnly || !handled.has(message.id))
        )
        const page = matching.slice(0, effectiveLimit)
        page.forEach((message) => seen.add(message.id))
        return {
          ok: true,
          kind: "read_board",
          messages: Object.freeze(
            page.map((message) =>
              Object.freeze({ ...this.decorate(message), myVote: this.votes.get(message.id)?.get(author) ?? 0, unread: !handled.has(message.id) })
            )
          ),
          through,
          nextAfter: page.at(-1)?.sequence ?? through,
          hasMore: matching.length > page.length,
          effectiveLimit,
          policy: this.policy
        }
      }
      if (command.kind === "upvote" || command.kind === "downvote") {
        const message = this.messages.find((message) => message.id === command.messageId)
        if (!message) return { ok: false, code: "not_found", message: "Message does not exist." }
        if (message.author === author) return invalid("You cannot vote on your own contribution.")
        if (!seen.has(message.id)) return { ok: false, code: "not_seen", message: "Read the message before voting." }
        const votes = this.votes.get(message.id) ?? new Map<string, number>()
        const direction = command.kind === "upvote" ? 1 : -1
        if (command.remove) {
          if (votes.get(author) === direction) votes.delete(author)
        } else votes.set(author, direction)
        this.votes.set(message.id, votes)
        return { ok: true, kind: command.kind, messageId: message.id, vote: votes.get(author) ?? 0, score: this.score(message.id) }
      }
      if (command.kind === "acknowledge") {
        if (command.messageIds.length > this.policy.maxAcknowledgments)
          return invalid(
            `Acknowledge at most ${this.policy.maxAcknowledgments} messages per call.`
          )
        if (command.messageIds.some((id) => !seen.has(id)))
          return {
            ok: false,
            code: "not_seen",
            message:
              "Acknowledge only message IDs returned by your reads or writes."
          }
        command.messageIds.forEach((id) => handled.add(id))
        return {
          ok: true,
          kind: "acknowledge",
          messageIds: Object.freeze([...command.messageIds])
        }
      }
      if (command.body.length > this.policy.maxBodyCharacters)
        return invalid(
          `Message bodies may contain at most ${this.policy.maxBodyCharacters} characters.`
        )
      let parent: ForumMessage | undefined
      if (command.kind === "reply") {
        parent = this.messages.find(
          (message) => message.id === command.parentId
        )
        if (!parent)
          return {
            ok: false,
            code: "not_found",
            message: "Parent message does not exist."
          }
        if (!seen.has(parent.id))
          return {
            ok: false,
            code: "not_seen",
            message: "Read the parent message before replying."
          }
      } else if (command.title.length > this.policy.maxTitleCharacters)
        return invalid(
          `Thread titles may contain at most ${this.policy.maxTitleCharacters} characters.`
        )
      const sequence = this.messages.length + 1
      const id = `message-${sequence}`
      const message: ForumMessage = Object.freeze({
        id,
        sequence,
        at,
        author,
        body: command.body,
        threadId: parent?.threadId ?? id,
        ...(parent ? { parentId: parent.id } : {}),
        ...(command.kind === "create_post" ? { title: command.title } : {})
      })
      this.messages.push(message)
      seen.add(id)
      handled.add(id)
      if (parent) handled.add(parent.id)
      return { ok: true, kind: command.kind, message }
    }
    const output = Object.freeze(result())
    this.operations.set(key, { fingerprint, result: output })
    if (
      output.ok &&
      (output.kind === "create_post" || output.kind === "reply")
    ) {
      this.revision++
      this.listeners.forEach((listener) => listener(output.message))
    }
    if (output.ok && (output.kind === "upvote" || output.kind === "downvote" || output.kind === "create_post" || output.kind === "reply")) {
      if (output.kind === "upvote" || output.kind === "downvote") this.revision++
      this.changes.forEach((listener) => listener())
    }
    return output
  }
}

// forumLayer binds a shared store to the identity of the actor thread using it.
export const forumLayer = (store: MemoryForum, author: string) =>
  Layer.succeed(Forum, store.bind(author))
