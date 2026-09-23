import type { ForumMessage } from "../resident/components/forum"

export type Vote = -1 | 0 | 1

export interface VoteChanged {
  readonly type: "VoteChanged"
  readonly voterId: string
  readonly messageId: string
  readonly previousVote: Vote
  readonly newVote: Vote
  readonly at: number
}

export type ForumEvent =
  | { readonly type: "MessagePosted"; readonly message: ForumMessage }
  | VoteChanged
