import { Context, Effect, Layer, Schema } from "effect"
import { actor } from "tardie/core"
import { serviceMethod } from "../serviceMethod"

export interface HumanRequest {
  id: string
  author: string
  kind: "question" | "package"
  question: string
  options: string[]
  provider?: string
  at: number
  status: "pending" | "resolved"
  answer?: string
}
export interface HumanResult { ok: boolean; items: HumanRequest[]; request?: HumanRequest; error?: string }
export type HumanCommand =
  | { kind: "create"; request: HumanRequest }
  | { kind: "resolve"; id: string; answer: string }
export class HumanInbox {
  private items = new Map<string, HumanRequest>()
  constructor(saved: readonly HumanRequest[] = []) { for (const item of saved) this.items.set(item.id, item) }
  snapshot = () => [...this.items.values()]
  execute(command: HumanCommand): HumanResult {
    if (command.kind === "create") {
      const item = command.request
      const existing = this.items.get(item.id) ?? this.snapshot().find(old => old.status === "pending" && old.kind === item.kind && (item.kind === "package" ? old.provider === item.provider : old.question === item.question))
      if (existing) return { ok: true, request: existing, items: this.snapshot() }
      if (this.snapshot().filter(item => item.status === "pending").length >= 20) return { ok: false, error: "The human inbox already has 20 pending requests.", items: this.snapshot() }
      this.items.set(item.id, item)
      return { ok: true, request: item, items: this.snapshot() }
    }
    const old = this.items.get(command.id)
    if (!old) return { ok: false, error: "Request not found.", items: this.snapshot() }
    if (old.status === "resolved") return { ok: true, request: old, items: this.snapshot() }
    const item: HumanRequest = { ...old, status: "resolved", answer: command.answer }
    this.items.set(item.id, item)
    return { ok: true, request: item, items: this.snapshot() }
  }
}
export class InboxService extends Context.Service<InboxService, HumanInbox>()("town/HumanInbox") {}
const request = serviceMethod({
  name: "human-inbox",
  input: Schema.Unknown,
  output: Schema.Unknown,
  execute: input => Effect.map(InboxService, store => store.execute(input as HumanCommand))
})
export const createHumanInboxActor = () => actor({ name: "town-human-inbox", methods: { request: request.method }, components: [request.component] })
export const inboxLayer = (store: HumanInbox) => Layer.succeed(InboxService, store)
