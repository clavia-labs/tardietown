import { Context, Effect, Layer } from "effect"
import { HttpClient, HttpClientRequest } from "effect/unstable/http"
import type { TownSnapshot, ServerTownOptions } from "../src/town/protocol"
import type { SavedTown, TownAccess as BaseTownAccess } from "../src/town/connection"
import type { ResidentEventPage } from "../src/actors/resident/events"
import type { Resident } from "../src/town/world"

export type TownAccess = BaseTownAccess & { snapshot: TownSnapshot }

export class TownApi extends Context.Service<TownApi, {
  list: () => Effect.Effect<SavedTown[], Error>
  create: (options: ServerTownOptions) => Effect.Effect<TownAccess, Error>
  open: (id: string) => Effect.Effect<TownAccess, Error>
  snapshot: (access: TownAccess) => Effect.Effect<TownSnapshot, Error>
  actors: (access: TownAccess) => Effect.Effect<readonly Resident[], Error>
  events: (access: TownAccess, resident: string, cursor: number) => Effect.Effect<ResidentEventPage, Error>
}>()("town/TownApi") {}

export const townApiLayer = Layer.effect(TownApi, Effect.gen(function*() {
  const client = yield* HttpClient.HttpClient
  const port = Number(process.env.TOWN_PORT ?? 4244)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error("TOWN_PORT must be a valid port number.")
  const base = `http://127.0.0.1:${port}`
  const call = <T>(method: "GET" | "POST", path: string, body?: unknown, token?: string): Effect.Effect<T, Error> =>
    Effect.gen(function*() {
      let request = HttpClientRequest.make(method)(base + path)
      if (token) request = HttpClientRequest.bearerToken(request, token)
      if (body !== undefined) request = HttpClientRequest.bodyJsonUnsafe(request, body)
      const response = yield* client.execute(request).pipe(
        Effect.mapError(() => Error(`Cannot reach the town server at ${base}. Start it with bun run dev.`))
      )
      const value = (yield* response.json.pipe(
        Effect.mapError(() => Error("Town server sent an invalid response."))
      )) as unknown
      if (response.status < 200 || response.status >= 300) {
        const error = value as { error?: string }
        return yield* Effect.fail(Error(error?.error ?? `Town server returned ${response.status}.`))
      }
      return value as T
    })
  return {
    list: () => call<SavedTown[]>("GET", "/api/towns"),
    create: options => call<TownAccess>("POST", "/api/towns", options),
    open: id => call<TownAccess>("POST", `/api/towns/${encodeURIComponent(id)}/open`),
    snapshot: access => call<TownSnapshot>("GET", `/api/towns/${encodeURIComponent(access.id)}`, undefined, access.token),
    actors: access => call<readonly Resident[]>("GET", `/api/towns/${encodeURIComponent(access.id)}/actors`, undefined, access.token),
    events: (access, resident, cursor) => call<ResidentEventPage>(
      "GET",
      `/api/towns/${encodeURIComponent(access.id)}/resident-events?resident=${encodeURIComponent(resident)}&cursor=${cursor}`,
      undefined,
      access.token
    )
  }
}))
