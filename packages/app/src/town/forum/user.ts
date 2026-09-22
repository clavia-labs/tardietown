import { Effect } from "effect"
import type { ForumCommand } from "../agent/components/forum"
import { MemoryForum } from "./store"

export type UserForumCommand = Extract<
  ForumCommand,
  { kind: "create_post" | "reply" }
>

export async function submitUserPost(
  board: MemoryForum,
  command: UserForumCommand,
  operationId: string
) {
  const service = board.bind("user")
  if (command.kind === "reply") {
    const target = board
      .snapshot()
      .find((message) => message.id === command.parentId)
    if (target)
      await Effect.runPromise(
        service.execute(
          {
            kind: "read_board",
            threadId: target.threadId,
            after: target.sequence - 1,
            through: target.sequence,
            limit: 1
          },
          `${operationId}:read`
        )
      )
  }
  return Effect.runPromise(service.execute(command, operationId))
}


export function createMissionForum(mission: string): MemoryForum {
  const board = new MemoryForum()
  const result = Effect.runSync(board.bind("user").execute({ kind: "create_post", title: "Town mission", body: mission }, "town-mission"))
  if (!result.ok) throw new Error(result.message)
  return board
}
