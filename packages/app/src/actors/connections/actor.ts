import { Context, Effect, Layer, Schema } from "effect"
import { actor } from "tardie/core"
import { serviceMethod } from "../serviceMethod"

// Only an opaque request ID enters the actor log. The host owns short-lived
// request arguments and responses; OAuth codes and credentials never enter it.
export class ConnectionsService extends Context.Service<ConnectionsService, {
  execute: (requestId: string, action: string) => Effect.Effect<unknown, Error>
}>()("town/Connections") {}
const request = serviceMethod({
  name: "connection-request",
  input: Schema.Struct({ requestId: Schema.String, action: Schema.String }),
  output: Schema.Struct({ ok: Schema.Boolean, connections: Schema.optionalKey(Schema.Unknown) }),
  execute: input => Effect.flatMap(ConnectionsService, service => service.execute(input.requestId, input.action).pipe(
    Effect.match({ onSuccess: connections => ({ ok: true, ...(connections === undefined ? {} : { connections }) }), onFailure: () => ({ ok: false }) })
  ))
})
export const createConnectionsActor = () => actor({ name: "town-connections", methods: { request: request.method }, components: [request.component] })
export const connectionsLayer = (execute: (requestId: string, action: string) => Effect.Effect<unknown, Error>) => Layer.succeed(ConnectionsService, { execute })
