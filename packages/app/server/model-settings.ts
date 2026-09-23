import { Context, Effect, Layer, ManagedRuntime, Redacted } from "effect"
import { join } from "node:path"
import { mkdir, writeFile, unlink } from "node:fs/promises"
import { bunModelServices } from "tardie/server/model-services"
import { CredentialStore } from "./mcp/credentials"
import { sqliteCredentialsLayer } from "./mcp/credentials-bun"

const providers = {
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", protocol: "openai-chat-completions", env: "OPENROUTER_API_KEY" },
  openai: { baseUrl: "https://api.openai.com/v1", protocol: "openai-responses", env: "OPENAI_API_KEY" },
  anthropic: { baseUrl: "https://api.anthropic.com", protocol: "anthropic", env: "ANTHROPIC_API_KEY" }
} as const
interface Saved { provider: keyof typeof providers; model: string; apiKey: string }
export class ModelSettingsService extends Context.Service<ModelSettingsService, {
  read: () => Effect.Effect<Saved | undefined, unknown>
  save: (value: Saved) => Effect.Effect<void, unknown>
}>()("town/ModelSettings") {}
const settingsLayer = Layer.effect(ModelSettingsService, Effect.map(CredentialStore, store => ({
  read: () => store.get("model-default").pipe(Effect.map(value => value ? JSON.parse(Redacted.value(value)) as Saved : undefined)),
  save: (value: Saved) => store.set("model-default", Redacted.make(JSON.stringify(value)))
})))
export async function modelSettings(directory: string, fallback: Awaited<ReturnType<typeof bunModelServices>>) {
  const runtime = ManagedRuntime.make(settingsLayer.pipe(Layer.provide(sqliteCredentialsLayer(join(directory, "private", "settings.sqlite")))))
  const store = await runtime.runPromise(ModelSettingsService)
  let saved = await Effect.runPromise(store.read())
  const build = async (value: Saved) => {
    const provider = providers[value.provider]
    const folder = join(directory, "private")
    await mkdir(folder, { recursive: true, mode: 0o700 })
    const path = join(folder, `model-${crypto.randomUUID()}.json`)
    // Only non-secret model configuration goes into this short-lived file.
    await writeFile(path, JSON.stringify({ vars: { TARDIGRADE_CONFIG: { models: { allow: "*", default: { provider: value.provider, model_id: value.model }, providers: { [value.provider]: { baseUrl: provider.baseUrl, protocol: provider.protocol, env: [provider.env] } } } } } }), { mode: 0o600 })
    try { return await bunModelServices({ configFile: path, env: { ...process.env, [provider.env]: value.apiKey } }) }
    finally { await unlink(path) }
  }
  let current = saved ? await build(saved) : fallback
  const snapshot = () => {
    const selected = current.config.model.default
    const provider = selected?.provider ?? "openrouter"
    const config = current.config.model.providers[provider]
    const configured = !!config?.env.some(name => !!current.config.modelCredentials[name])
    return { provider, model: selected?.model_id ?? "", configured }
  }
  let queue = Promise.resolve()
  return {
    current: () => ({ layers: current.layers, model: `${current.config.model.default?.provider}/${current.config.model.default?.model_id}` }),
    snapshot,
    save: (input: unknown) => {
      const job = queue.then(async () => {
        const value = input as { provider?: string; model?: string; apiKey?: string }
        if (!value || !Object.hasOwn(providers, value.provider ?? "") || typeof value.model !== "string" || !value.model.trim() || value.model.length > 200 || /[\r\n]/.test(value.model)) throw Error("Choose a provider and a valid model ID.")
        const provider = value.provider as Saved["provider"]
        const apiKey = value.apiKey?.trim() || (saved?.provider === provider ? saved.apiKey : current.config.modelCredentials[providers[provider].env])
        if (!apiKey || apiKey.length > 4096 || /[\r\n]/.test(apiKey)) throw Error("Enter an API key for this provider.")
        const next = { provider, model: value.model.trim(), apiKey }
        const services = await build(next)
        await Effect.runPromise(store.save(next))
        saved = next; current = services
        return snapshot()
      })
      queue = job.then(() => {}, () => {})
      return job
    },
    close: () => runtime.dispose()
  }
}
