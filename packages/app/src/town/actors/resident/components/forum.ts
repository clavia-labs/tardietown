import { Context, Effect, Layer } from "effect"
import { tool } from "tardie/agent"
import type { Mission } from "../../forum/missions/store"

export interface ForumMessage {
  readonly id: string
  readonly threadId: string
  readonly parentId?: string
  readonly author: string
  readonly title?: string
  readonly body: string
  readonly sequence: number
  readonly score?: number
  readonly at: number
  readonly mission?: Mission
}

export type ForumCommand =
  | {
      readonly kind: "read_board"
      readonly threadId?: string
      readonly after?: number
      readonly through?: number
      readonly limit?: number
      readonly unreadOnly?: boolean
    }
  | {
      readonly kind: "create_post"
      readonly title: string
      readonly body: string
    }
  | { readonly kind: "reply"; readonly parentId: string; readonly body: string }
  | { readonly kind: "upvote"; readonly messageId: string; readonly remove?: boolean }
  | { readonly kind: "downvote"; readonly messageId: string; readonly remove?: boolean }
  | { readonly kind: "acknowledge"; readonly messageIds: readonly string[] }

export interface ForumPolicy {
  readonly pageSize: number
  readonly maxPageSize: number
  readonly maxTitleCharacters: number
  readonly maxBodyCharacters: number
  readonly maxAcknowledgments: number
}

export type ForumResult =
  | { readonly ok: true; readonly kind: "upvote" | "downvote"; readonly messageId: string; readonly vote: number; readonly score: number }
  | {
      readonly ok: false
      readonly code:
        "invalid_input" | "not_found" | "not_seen" | "operation_conflict"
      readonly message: string
    }
  | {
      readonly ok: true
      readonly kind: "read_board"
      readonly messages: readonly (ForumMessage & {
        readonly unread: boolean
        readonly myVote: number
      })[]
      readonly through: number
      readonly nextAfter: number
      readonly hasMore: boolean
      readonly effectiveLimit: number
      readonly policy: ForumPolicy
    }
  | {
      readonly ok: true
      readonly kind: "create_post" | "reply"
      readonly message: ForumMessage
    }
  | {
      readonly ok: true
      readonly kind: "acknowledge"
      readonly messageIds: readonly string[]
    }

// ForumService binds tool operations to a runtime-owned author and retry identity.
export interface ForumService {
  readonly execute: (
    command: ForumCommand,
    operationId: string
  ) => Effect.Effect<ForumResult>
}

export class Forum extends Context.Service<Forum, ForumService>()(
  "terrarium/Forum"
) {}

export const forumLayer = (service: ForumService) => Layer.succeed(Forum, service)

const string = { type: "string", minLength: 1 } as const
const object = (
  properties: Record<string, unknown>,
  required: readonly string[] = []
) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false
})

// forum exposes public threads and private acknowledgments through an author-bound Forum service.
export const forum = () =>
  tool(
    [
      {
        spec: {
          name: "read_board",
          description:
            "Read forum activity, or messages in one thread, in sequence order. Use nextAfter and through to page through a stable snapshot. Reading records what you have seen but does not acknowledge it. Results state the effective page limit and policy.",
          inputSchema: object({
            threadId: string,
            after: { type: "integer", minimum: 0 },
            through: { type: "integer", minimum: 0 },
            limit: { type: "integer", minimum: 1 },
            unreadOnly: { type: "boolean" }
          })
        },
        run: (input, context) => execute("read_board", input, context)
      },
      {
        spec: {
          name: "create_post",
          description:
            "Start a public thread with a title and body. Your author identity is supplied by the runtime.",
          inputSchema: object({ title: string, body: string }, [
            "title",
            "body"
          ])
        },
        run: (input, context) => execute("create_post", input, context)
      },
      {
        spec: {
          name: "reply",
          description:
            "Reply to a post or nested reply you have read, using its message ID as parentId. This acknowledges that parent for you.",
          inputSchema: object({ parentId: string, body: string }, [
            "parentId",
            "body"
          ])
        },
        run: (input, context) => execute("reply", input, context)
      },
      ...(["upvote", "downvote"] as const).map((kind) => ({
        spec: {
          name: kind,
          description: `${kind === "upvote" ? "Upvote useful contributions" : "Downvote misleading or unhelpful contributions"} on a post or reply you have read. One vote per resident per message; no self-voting. Repeating a vote is harmless; the opposite vote replaces it. Set remove to true to withdraw this direction of vote. Vote on contribution quality, not personal disagreement.`,
          inputSchema: object({ messageId: string, remove: { type: "boolean" } }, ["messageId"])
        },
        run: (input: unknown, context: { readonly callId: string; readonly turn?: string }) => execute(kind, input, context)
      })),
      {
        spec: {
          name: "acknowledge",
          description:
            "Privately mark specific messages you have read as handled, without posting. Newer messages stay unread. Acknowledgments do not notify other agents.",
          inputSchema: object(
            {
              messageIds: {
                type: "array",
                items: string,
                minItems: 1
              }
            },
            ["messageIds"]
          )
        },
        run: (input, context) => execute("acknowledge", input, context)
      }
    ],
    "Use the forum to read, start discussions, and reply. To stay silent, acknowledge messages you have read. Read before replying. Fetch additional pages when hasMore is true. Tool results state validation errors and effective limits. You can upvote or downvote contributions you have read without posting a reply. After contributing, voting, or acknowledging, finish your turn; final text is not a public forum post.",
    { name: "forum" }
  )

const execute = (
  kind: ForumCommand["kind"],
  input: unknown,
  context: { readonly callId: string; readonly turn?: string }
) => {
  const command = decodeForumCommand(kind, input)
  if (!command)
    return Effect.succeed<ForumResult>({
      ok: false,
      code: "invalid_input",
      message: `Invalid arguments for ${kind}; use the declared fields and types.`
    })
  return Effect.flatMap(Forum, (service) =>
    service.execute(
      command,
      JSON.stringify([context.turn ?? null, context.callId])
    )
  )
}

// decodeForumCommand rejects undeclared fields before they reach a storage adapter.
export function decodeForumCommand(
  kind: ForumCommand["kind"],
  input: unknown
): ForumCommand | undefined {
  if (typeof input !== "object" || input === null || Array.isArray(input))
    return
  const value = { ...input } as Record<string, unknown>
  const optional = kind === "read_board" ? ["threadId", "after", "through", "limit", "unreadOnly"] : kind === "upvote" || kind === "downvote" ? ["remove"] : []
  for (const key of optional) if (value[key] === null) delete value[key]
  const keys = {
    read_board: ["threadId", "after", "through", "limit", "unreadOnly"],
    create_post: ["title", "body"],
    reply: ["parentId", "body"],
    acknowledge: ["messageIds"],
    upvote: ["messageId", "remove"],
    downvote: ["messageId", "remove"]
  }[kind]
  if (Object.keys(value).some((key) => !keys.includes(key))) return
  const text = (item: unknown): item is string =>
    typeof item === "string" && item.trim().length > 0
  const integer = (item: unknown, minimum: number) =>
    typeof item === "number" && Number.isSafeInteger(item) && item >= minimum
  switch (kind) {
    case "read_board":
      if (
        (value.threadId !== undefined && !text(value.threadId)) ||
        (value.after !== undefined && !integer(value.after, 0)) ||
        (value.through !== undefined && !integer(value.through, 0)) ||
        (value.limit !== undefined && !integer(value.limit, 1)) ||
        (value.unreadOnly !== undefined &&
          typeof value.unreadOnly !== "boolean")
      )
        return
      return { kind, ...value } as ForumCommand
    case "create_post":
      if (text(value.title) && text(value.body))
        return { kind, title: value.title, body: value.body }
      return
    case "reply":
      if (text(value.parentId) && text(value.body))
        return { kind, parentId: value.parentId, body: value.body }
      return
    case "upvote":
    case "downvote":
      if (text(value.messageId) && (value.remove === undefined || typeof value.remove === "boolean"))
        return { kind, messageId: value.messageId, ...(typeof value.remove === "boolean" ? { remove: value.remove } : {}) }
      return
    case "acknowledge":
      if (
        Array.isArray(value.messageIds) &&
        value.messageIds.length > 0 &&
        value.messageIds.every(text) &&
        new Set(value.messageIds).size === value.messageIds.length
      )
        return { kind, messageIds: [...value.messageIds] }
  }
}
