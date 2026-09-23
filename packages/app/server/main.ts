import { modelSettings } from "./model-settings"
import { BunHttpServer, BunRuntime } from "@effect/platform-bun"
import { Effect, Layer } from "effect"
import { HttpServer, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { join } from "node:path"
import { homedir } from "node:os"
export const DEFAULT_DATA_DIRECTORY = join(homedir(), ".tardietown")
// Runtime databases and logs contain private town content.
process.umask(0o077)
import { bunModelServices } from "tardie/server/model-services"
import { createTownService } from "./towns"
import { DEFAULT_EXA_POLICY } from "../src/actors/resident/components/code/exa"
import { DEFAULT_TOWN_SERVER_PORT } from "../src/town/protocol"
import { DEFAULT_MISSION_POLICY } from "../src/actors/forum/missions/store"
import { DEFAULT_LIBRARY_POLICY } from "../src/actors/library/store"

const services = await bunModelServices({
  configFile:
    process.env.TARDIGRADE_CONFIG_PATH ??
    new URL("../tardie-town.config.json", import.meta.url),
  env: process.env
})
const settings = await modelSettings(process.env.TOWN_DATA_DIRECTORY ?? DEFAULT_DATA_DIRECTORY, services)
const configuredNumber = (name: string) =>
  process.env[name] === undefined ? undefined : Number(process.env[name])
const service = createTownService({
  layers: services.layers,
  modelServices: settings.current,
  dataDirectory: process.env.TOWN_DATA_DIRECTORY ?? DEFAULT_DATA_DIRECTORY,
  ...(process.env.TOWN_ARTIFACT_DIRECTORY ? { artifactDirectory: process.env.TOWN_ARTIFACT_DIRECTORY } : {}),
  exa: {
    apiKey: process.env.EXA_API_KEY,
    policy: {
      maxResults:
        configuredNumber("EXA_MAX_RESULTS") ?? DEFAULT_EXA_POLICY.maxResults,
      maxCharacters:
        configuredNumber("EXA_MAX_CHARACTERS") ??
        DEFAULT_EXA_POLICY.maxCharacters,
      timeoutMs:
        configuredNumber("EXA_TIMEOUT_MS") ?? DEFAULT_EXA_POLICY.timeoutMs
    }
  },
  model: services.config.model.default
    ? `${services.config.model.default.provider}/${services.config.model.default.model_id}`
    : "No model configured",
  missionPolicy: {
    claimTtlMs:
      configuredNumber("MISSION_CLAIM_TTL_MS") ??
      DEFAULT_MISSION_POLICY.claimTtlMs
  },
  libraryPolicy: DEFAULT_LIBRARY_POLICY,
  maxAgents: configuredNumber("TOWN_MAX_AGENTS"),
  maxTowns: configuredNumber("TOWN_MAX_TOWNS"),
  maxTurns: configuredNumber("TOWN_MAX_TURNS"),
  maxToolCalls: configuredNumber("TOWN_MAX_TOOL_CALLS"),
  maxTimeoutMs: configuredNumber("TOWN_MAX_TIMEOUT_MS"),
  defaultTimeoutMs: configuredNumber("TOWN_TURN_TIMEOUT_MS"),
  heartbeatMs: configuredNumber("TOWN_HEARTBEAT_MS")
})
const port = configuredNumber("TOWN_PORT") ?? DEFAULT_TOWN_SERVER_PORT
const handleRequest = async (request: Request): Promise<Response> => {
    const url = new URL(request.url)
    if (url.pathname === "/api/settings") {
      const origin = request.headers.get("origin")
      if ((origin && origin !== url.origin) || request.headers.get("sec-fetch-site") === "cross-site") return Response.json({ error: "Invalid origin." }, { status: 403 })
      if (request.method === "GET") return Response.json(settings.snapshot(), { headers: { "Cache-Control": "no-store" } })
      if (request.method === "POST") {
        try { return Response.json(await settings.save(await request.json()), { headers: { "Cache-Control": "no-store" } }) }
        catch { return Response.json({ error: "Could not save provider settings. Check the provider, model ID, and API key." }, { status: 400 }) }
      }
      return new Response(null, { status: 405 })
    }
    return service.fetch(request)
}
const http = HttpServer.serve(Effect.gen(function*() {
  const request = yield* HttpServerRequest.HttpServerRequest
  const webRequest = yield* HttpServerRequest.toWeb(request)
  const response = yield* Effect.promise(() => handleRequest(webRequest))
  return HttpServerResponse.fromWeb(response)
})).pipe(
  Layer.provide(BunHttpServer.layer({ hostname: "127.0.0.1", port, idleTimeout: 0 }))
)
const cleanup = Layer.effectDiscard(Effect.addFinalizer(() => Effect.promise(async () => {
  await service.close()
  await settings.close()
})))
console.log(`Tardie Town server listening at http://127.0.0.1:${port}/`)
BunRuntime.runMain(Layer.launch(Layer.mergeAll(http, cleanup)))
