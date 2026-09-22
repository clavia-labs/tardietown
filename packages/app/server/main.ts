import { join } from "node:path"
export const DEFAULT_ARTIFACT_DIRECTORY = join(import.meta.dir, "../.artifacts")
import { bunModelServices } from "@clavia/tardigrade-server/model-services"
import { modelAdapters } from "@clavia/tardigrade-model/adapter"
import { openAICompatibleAdapter } from "@clavia/tardigrade-model/openai"
import { createColonyService } from "./colonies"
import { DEFAULT_EXA_POLICY } from "../src/town/actors/resident/components/code/exa"
import { DEFAULT_COLONY_SERVER_PORT } from "../src/town/protocol"
import { DEFAULT_MISSION_POLICY } from "../src/town/workspace/missions/store"
import { DEFAULT_LIBRARY_POLICY } from "../src/town/actors/library/store"

const services = await bunModelServices({
  configFile:
    process.env.TARDIGRADE_CONFIG_PATH ??
    new URL("../tardie-town.config.json", import.meta.url),
  env: process.env,
  adapters: modelAdapters(openAICompatibleAdapter)
})
const configuredNumber = (name: string) =>
  process.env[name] === undefined ? undefined : Number(process.env[name])
const service = createColonyService({
  layers: services.layers,
  artifactDirectory: process.env.TOWN_ARTIFACT_DIRECTORY ?? DEFAULT_ARTIFACT_DIRECTORY,
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
  maxAgents: configuredNumber("COLONY_MAX_AGENTS"),
  maxColonies: configuredNumber("COLONY_MAX_COLONIES"),
  maxTurns: configuredNumber("COLONY_MAX_TURNS"),
  maxToolCalls: configuredNumber("COLONY_MAX_TOOL_CALLS"),
  maxTimeoutMs: configuredNumber("COLONY_MAX_TIMEOUT_MS"),
  defaultTimeoutMs: configuredNumber("COLONY_TURN_TIMEOUT_MS"),
  heartbeatMs: configuredNumber("COLONY_HEARTBEAT_MS")
})
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: configuredNumber("COLONY_PORT") ?? DEFAULT_COLONY_SERVER_PORT,
  idleTimeout: 0,
  fetch: service.fetch
})
console.log(`Tardie Town colony server listening at ${server.url}`)
await new Promise<void>((resolve) => {
  process.once("SIGINT", resolve)
  process.once("SIGTERM", resolve)
})
await service.close()
await server.stop(true)
