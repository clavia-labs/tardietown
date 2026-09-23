#!/usr/bin/env bun
import { Console, Effect, Layer } from "effect"
import { Argument, CliError, Command, Flag } from "effect/unstable/cli"
import { FetchHttpClient } from "effect/unstable/http"
import { BunRuntime, BunServices } from "@effect/platform-bun"
import { townApiLayer, TownApi } from "./town-api"

const json = Flag.Boolean("json").pipe(Flag.withDescription("Print JSON for scripts and agents."), Flag.withDefault(false))
const townId = Argument.String("town-id")
const show = (value: unknown, lines: string, asJson: boolean) => Console.log(asJson ? JSON.stringify(value, null, 2) : lines)
const userError = (cause: unknown) => CliError.UserError.make({
  cause,
  userMessage: cause instanceof Error ? cause.message : String(cause)
})
const call = <A>(effect: Effect.Effect<A, Error, TownApi>) => effect.pipe(Effect.mapError(userError))

const list = Command.make("list", { json }, flags => Effect.gen(function*() {
  const api = yield* TownApi
  const towns = yield* call(api.list())
  yield* show(towns, towns.length
    ? towns.map(town => `${town.id}  ${town.name}  ${town.residents} residents  ${town.running ? "running" : "paused"}`).join("\n")
    : "No saved towns.", flags.json)
})).pipe(Command.withDescription("List saved and running towns."))

const create = Command.make("create", {
  name: Flag.String("name"),
  mission: Flag.String("mission"),
  residents: Flag.Int("residents").pipe(Flag.withDefault(10)),
  budget: Flag.Finite("budget").pipe(Flag.withDefault(1)),
  concurrency: Flag.Int("concurrency").pipe(Flag.withDefault(2)),
  json
}, flags => Effect.gen(function*() {
  if (!flags.name.trim() || !flags.mission.trim()) return yield* userError("Name and mission cannot be empty.")
  if (!Number.isInteger(flags.residents) || flags.residents < 1) return yield* userError("Residents must be a positive integer.")
  if (!Number.isFinite(flags.budget) || flags.budget <= 0) return yield* userError("Budget must be positive.")
  if (!Number.isInteger(flags.concurrency) || flags.concurrency < 1) return yield* userError("Concurrency must be a positive integer.")
  const api = yield* TownApi
  const town = yield* call(api.create({
    config: {
      name: flags.name.trim(),
      premise: flags.mission.trim(),
      count: flags.residents,
      messagesPerAgent: 3,
      timeoutMs: 300000,
      postWords: 45,
      bubbleCharacters: 110
    },
    maxConcurrent: flags.concurrency,
    maxToolCalls: 50,
    maxTurns: 1000,
    budgetUsd: flags.budget
  }))
  yield* show(
    { id: town.id, token: town.token, name: town.snapshot.config.name, residents: town.snapshot.residents.length },
    `Created ${town.snapshot.config.name} (${town.id}) with ${town.snapshot.residents.length} residents.`,
    flags.json
  )
})).pipe(Command.withDescription("Create and start a town. This can spend its model budget."))

const open = Command.make("open", { id: townId, json }, flags => Effect.gen(function*() {
  const api = yield* TownApi
  const town = yield* call(api.open(flags.id))
  yield* show(
    { id: town.id, token: town.token, name: town.snapshot.config.name, running: town.snapshot.state.running },
    `Opened ${town.snapshot.config.name} (${town.id}); ${town.snapshot.state.running ? "running" : "paused"}.`,
    flags.json
  )
})).pipe(Command.withDescription("Open a saved town and print its access token with --json."))

const residents = Command.make("actors", { id: townId, json }, flags => Effect.gen(function*() {
  const api = yield* TownApi
  const town = yield* call(api.open(flags.id))
  const actors = yield* call(api.actors(town))
  yield* show(actors,
    actors.map(resident => `${resident.id}  ${resident.name}`).join("\n") || "No residents.",
    flags.json)
})).pipe(Command.withAlias("residents"), Command.withDescription("List the resident actors in a town."))

const events = Command.make("events", {
  id: townId,
  resident: Argument.String("resident-id"),
  cursor: Flag.Int("cursor").pipe(Flag.withDefault(0)),
  json
}, flags => Effect.gen(function*() {
  if (!Number.isSafeInteger(flags.cursor) || flags.cursor < 0) return yield* userError("Cursor must be a nonnegative integer.")
  const api = yield* TownApi
  const town = yield* call(api.open(flags.id))
  const page = yield* call(api.events(town, flags.resident, flags.cursor))
  yield* show(page,
    page.events.map(event => `${event.seq}  ${event.type}  ${event.details}`).join("\n") +
      (page.hasMore ? `\nMore events: --cursor ${page.cursor}` : ""),
    flags.json)
})).pipe(Command.withDescription("Read one resident's events; use --cursor to page."))

const town = Command.make("town").pipe(
  Command.withDescription("Create and inspect Tardie Towns through the local HTTP API."),
  Command.withSubcommands([list, create, open, residents, events])
)

Command.run(town, { version: "0.1.0" }).pipe(
  Effect.provide(Layer.mergeAll(BunServices.layer, townApiLayer.pipe(Layer.provide(FetchHttpClient.layer)))),
  BunRuntime.runMain
)
