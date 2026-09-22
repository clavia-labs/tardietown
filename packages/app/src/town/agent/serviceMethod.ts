import { Effect, type Schema } from "effect"
import { actorMethod, component, handles } from "tardie/core"

interface State<Output> {
  readonly requests: ReadonlyMap<string, unknown>
  readonly replies: ReadonlyMap<string, Output>
  readonly transitions: ReadonlyMap<string, unknown>
  readonly cancellations: ReadonlyMap<string, { readonly cause: "requested" | "deadline"; readonly reason?: string; readonly deadlineAt?: number }>
}

// serviceMethod defines one native actor method whose effect follows the invocation event identity.
export function serviceMethod<InputSchema extends Schema.ConstraintDecoder<unknown>, OutputSchema extends Schema.ConstraintDecoder<unknown>, Requirements>(options: {
  readonly name: string
  readonly input: InputSchema
  readonly output: OutputSchema
  readonly execute: (input: InputSchema["Type"]) => Effect.Effect<OutputSchema["Type"], never, Requirements>
}) {
  type Output = OutputSchema["Type"]
  const requested = `${options.name}Requested`
  const completed = `${options.name}Completed`
  const cancelled = `${options.name}Cancelled`
  const initial = (): State<Output> => ({ requests: new Map(), replies: new Map(), transitions: new Map(), cancellations: new Map() })
  const method = actorMethod({
    input: options.input,
    output: options.output,
    event: ({ invocation, input, at }) => ({ type: requested, id: invocation.id, payload: input, at }),
    projection: {
      initial,
      step: (state, event) => {
        const value = event as { readonly id?: unknown; readonly payload?: unknown; readonly output?: unknown }
        if (event.type === requested && typeof value.id === "string") return { ...state, requests: new Map(state.requests).set(value.id, value.payload) }
        if (event.type === completed && typeof value.id === "string") return { ...state, replies: new Map(state.replies).set(value.id, value.output as Output) }
        if (event.type === cancelled && typeof value.id === "string") return { ...state, cancellations: new Map(state.cancellations).set(value.id, value as never) }
        return state
      },
      output: (state) => ({
        currentEpoch: () => 0,
        invocationState: (invocation) => {
          if (!state.requests.has(invocation.id)) return undefined
          const cancellation = state.cancellations.get(invocation.id)
          if (cancellation) return { status: "cancelled" as const, ...cancellation }
          const output = state.replies.get(invocation.id)
          return output === undefined ? { status: "pending" as const } : { status: "completed" as const, output }
        }
      })
    },
    cancellation: { event: (request, at) => ({ type: cancelled, id: request.invocation.id, cause: request.cause, ...(request.reason === undefined ? {} : { reason: request.reason }), ...(request.deadlineAt === undefined ? {} : { deadlineAt: request.deadlineAt }), at }) }
  })
  const machine = component<State<Output>, undefined, Requirements>({
    name: options.name,
    initial,
    step: (state, event, context) => {
      const value = event as { readonly id?: unknown; readonly payload?: unknown; readonly output?: unknown }
      if (event.type === completed && typeof value.id === "string") return { ...state, replies: new Map(state.replies).set(value.id, value.output as Output), transitions: new Map([...state.transitions].filter(([id]) => id !== value.id)) }
      if (event.type !== requested || typeof value.id !== "string" || state.requests.has(value.id)) return state
      const id = value.id
      const transition = context.effect("execute", { input: { id, value: value.payload as InputSchema["Type"] }, act: ({ id, value }) => Effect.map(options.execute(value), (output) => [{ type: completed, id, output }]) })
      return { ...state, requests: new Map(state.requests).set(id, value.payload), transitions: new Map(state.transitions).set(id, transition) }
    },
    output: (state) => ({ view: undefined, transitions: [...state.transitions.values()] as never[] })
  })
  return { method, component: handles(method, machine) }
}
