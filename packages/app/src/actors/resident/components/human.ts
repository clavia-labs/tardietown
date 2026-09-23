import { Context, Effect, Layer } from "effect"
import { tool } from "tardie/agent"
import { toolSchema } from "./toolSchema"
import { MCP_PRESETS } from "../../../town/packages/presets"

export class HumanAccess extends Context.Service<HumanAccess, {
  request: (kind: "question" | "package" | "list", input: unknown, operationId: string) => Promise<unknown>
}>()("town/HumanAccess") {}
export const humanLayer = (service: Context.Service.Shape<typeof HumanAccess>) => Layer.succeed(HumanAccess, service)
const run = (kind: "question" | "package" | "list") => (input: unknown, context: { callId: string; turn?: string }) => Effect.flatMap(HumanAccess, service => Effect.tryPromise({
  try: () => service.request(kind, input, JSON.stringify([context.turn, context.callId])),
  catch: () => new Error("Human request failed. Try again later.")
}).pipe(Effect.catch(error => Effect.succeed({ ok: false, error: error.message }))))
export const human = () => tool([
  { spec: { name: "ask_human", description: "Main mission owner only: ask the user a necessary question. Returns a pending request; finish your turn and wait for the answer. Never ask for passwords or tokens.", inputSchema: toolSchema({ question: { type: "string", minLength: 1, maxLength: 2000 }, options: { type: "array", items: { type: "string", maxLength: 200 }, maxItems: 5 } }, ["question"]) }, run: run("question") },
  { spec: { name: "request_package", description: "Main mission owner only: install an official MCP package needed for the mission. Keyless packages connect immediately; others notify the human to sign in. Finish your turn while awaiting sign-in. Never request credentials in chat.", inputSchema: toolSchema({ provider: { type: "string", enum: MCP_PRESETS.map(preset => preset.name) }, reason: { type: "string", minLength: 1, maxLength: 2000 } }, ["provider", "reason"]) }, run: run("package") },
  { spec: { name: "read_human_inbox", description: "Read human answers and package request status. Only the main mission owner can create requests; other residents should coordinate with that owner.", inputSchema: toolSchema({}, []) }, run: run("list") }
], "The main mission owner coordinates questions and package requests through the human inbox. After a pending request, finish your turn; a response will notify you. Read the inbox on waking. Other residents should ask the main mission owner through the forum.", { name: "human" })
