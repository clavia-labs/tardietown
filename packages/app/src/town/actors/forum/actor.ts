import { Context, Effect, Layer, Schema } from "effect"
import { actor } from "tardie/core"
import { serviceMethod } from "../serviceMethod"
import { MemoryForum } from "./store"
import { submitUserPost } from "./user"
import { MissionStore } from "./missions/store"

const MissionSchema = Schema.Struct({
  id: Schema.String,
  description: Schema.String,
  parentMissionId: Schema.optionalKey(Schema.String),
  status: Schema.Literals(["open", "claimed", "completed"]),
  owner: Schema.optionalKey(Schema.String),
  claimExpiresAt: Schema.optionalKey(Schema.Number),
  artifactPath: Schema.optionalKey(Schema.String),
  artifactRevision: Schema.optionalKey(Schema.Number),
  requests: Schema.Array(Schema.Struct({ residentId: Schema.String, reason: Schema.String, at: Schema.Number })),
  history: Schema.Array(Schema.Struct({ at: Schema.Number, actor: Schema.String, action: Schema.String }))
})
const MessageSchema = Schema.Struct({
  id: Schema.String,
  threadId: Schema.String,
  parentId: Schema.optionalKey(Schema.String),
  author: Schema.String,
  title: Schema.optionalKey(Schema.String),
  body: Schema.String,
  sequence: Schema.Number,
  score: Schema.optionalKey(Schema.Number),
  at: Schema.Number,
  mission: Schema.optionalKey(MissionSchema)
})
const PolicySchema = Schema.Struct({
  pageSize: Schema.Number,
  maxPageSize: Schema.Number,
  maxTitleCharacters: Schema.Number,
  maxBodyCharacters: Schema.Number,
  maxAcknowledgments: Schema.Number
})
const PostSchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("create_post"), title: Schema.String, body: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("reply"), parentId: Schema.String, body: Schema.String })
])
const CommandSchema = Schema.Union([
  PostSchema,
  Schema.Struct({
    kind: Schema.Literal("read_board"),
    threadId: Schema.optionalKey(Schema.String),
    after: Schema.optionalKey(Schema.Number),
    through: Schema.optionalKey(Schema.Number),
    limit: Schema.optionalKey(Schema.Number),
    unreadOnly: Schema.optionalKey(Schema.Boolean)
  }),
  Schema.Struct({ kind: Schema.Literals(["upvote", "downvote"]), messageId: Schema.String, remove: Schema.optionalKey(Schema.Boolean) }),
  Schema.Struct({ kind: Schema.Literal("acknowledge"), messageIds: Schema.Array(Schema.String) })
])
export const ForumResponseSchema = Schema.Union([
  Schema.Struct({ ok: Schema.Literal(false), code: Schema.Literals(["invalid_input", "not_found", "not_seen", "operation_conflict"]), message: Schema.String }),
  Schema.Struct({ ok: Schema.Literal(true), kind: Schema.Literals(["create_post", "reply"]), message: MessageSchema }),
  Schema.Struct({ ok: Schema.Literal(true), kind: Schema.Literals(["upvote", "downvote"]), messageId: Schema.String, vote: Schema.Number, score: Schema.Number }),
  Schema.Struct({ ok: Schema.Literal(true), kind: Schema.Literal("acknowledge"), messageIds: Schema.Array(Schema.String) }),
  Schema.Struct({
    ok: Schema.Literal(true),
    kind: Schema.Literal("read_board"),
    messages: Schema.Array(Schema.Struct({ ...MessageSchema.fields, unread: Schema.Boolean, myVote: Schema.Number })),
    through: Schema.Number,
    nextAfter: Schema.Number,
    hasMore: Schema.Boolean,
    effectiveLimit: Schema.Number,
    policy: PolicySchema
  })
])

// The host supplies these stores once per town. They remain the read model for UI
// snapshots and notifications; live forum writes enter through this actor.
export class ForumState extends Context.Service<ForumState, {
  readonly board: MemoryForum
  readonly missions: MissionStore
}>()("town/ForumState") {}
const identity = { author: Schema.String, operationId: Schema.String }
const request = serviceMethod({
  name: "forum-request",
  input: Schema.Struct({ ...identity, command: CommandSchema }),
  output: ForumResponseSchema,
  execute: (input) => Effect.flatMap(ForumState, ({ board }) =>
    board.bind(input.author).execute(input.command, input.operationId)
  )
})
const post = serviceMethod({
  name: "forum-user-post",
  input: Schema.Struct({ operationId: Schema.String, command: PostSchema }),
  output: ForumResponseSchema,
  execute: (input) => Effect.flatMap(ForumState, ({ board }) =>
    submitUserPost(board, input.command, input.operationId)
  )
})
const missionPolicy = Schema.Struct({ claimTtlMs: Schema.Number })
const mission = serviceMethod({
  name: "forum-mission",
  input: Schema.Struct({
    ...identity,
    command: Schema.Union([
      Schema.Struct({ type: Schema.Literal("create_mission"), description: Schema.String, parentMissionId: Schema.optionalKey(Schema.NullOr(Schema.String)) }),
      Schema.Struct({ type: Schema.Literals(["claim_mission", "release_mission"]), missionId: Schema.String }),
      Schema.Struct({ type: Schema.Literal("request_handoff"), missionId: Schema.String, reason: Schema.String }),
      Schema.Struct({ type: Schema.Literal("transfer_mission"), missionId: Schema.String, toResidentId: Schema.String }),
      Schema.Struct({ type: Schema.Literal("complete_mission"), missionId: Schema.String, artifactPath: Schema.String })
    ])
  }),
  output: Schema.Union([
    Schema.Struct({ ok: Schema.Literal(true), mission: MissionSchema, policy: missionPolicy }),
    Schema.Struct({ ok: Schema.Literal(false), error: Schema.String, mission: Schema.optionalKey(MissionSchema), policy: missionPolicy })
  ]),
  // Mission creation and handoffs write to the board. Execute the entire
  // synchronous transition here so they cannot bypass the forum actor.
  execute: (input) => Effect.map(ForumState, ({ missions }) =>
    missions.execute(input.author, input.operationId, input.command)
  )
})

export const createForumActor = () => actor({
  name: "town-forum",
  methods: { request: request.method, post: post.method, mission: mission.method },
  components: [request.component, post.component, mission.component]
})
export const forumStateLayer = (board: MemoryForum, missions: MissionStore) =>
  Layer.succeed(ForumState, { board, missions })
