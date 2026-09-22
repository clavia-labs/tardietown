import { join } from "node:path"
import { createBunHost, serve } from "tardie/bun"
import { bunModelServices } from "@clavia/tardigrade-server/model-services"
import { modelAdapters } from "@clavia/tardigrade-model/adapter"
import { openAICompatibleAdapter } from "@clavia/tardigrade-model/openai"
import definition from "../src/legacy/actor"
import { DEFAULT_HOST_PORT } from "../src/town/world"

const { config, layers, api } = await bunModelServices({
  configFile:
    process.env.TARDIGRADE_CONFIG_PATH ??
    new URL("../tardie-town.config.json", import.meta.url),
  env: { ...process.env, PORT: process.env.PORT ?? String(DEFAULT_HOST_PORT) },
  adapters: modelAdapters(openAICompatibleAdapter)
})
const storage = config.db === ":memory:" ? ":memory:" : `${config.db}.actors`
const host = await createBunHost({
  actor: definition,
  storage,
  storageLayout: {
    databaseFor: (instance) =>
      storage === ":memory:"
        ? storage
        : join(
            storage,
            `${Buffer.from(instance).toString("base64url")}.sqlite`
          ),
    instanceFromFile: (file) =>
      file.endsWith(".sqlite")
        ? Buffer.from(file.slice(0, -7), "base64url").toString()
        : undefined
  },
  driver: { maxConcurrentThreads: config.maxConcurrentThreads },
  layersFor: () => layers
})
try {
  const server = await serve(host, {
    port: config.port,
    api,
    ...(config.token === undefined ? {} : { token: config.token })
  })
  try {
    console.log(`Tardie Town agent host listening at ${server.url}`)
    await new Promise<void>((resolve) => {
      const stop = () => {
        process.off("SIGINT", stop)
        process.off("SIGTERM", stop)
        resolve()
      }
      process.once("SIGINT", stop)
      process.once("SIGTERM", stop)
    })
  } finally {
    await server.close()
  }
} finally {
  await host.close()
}
