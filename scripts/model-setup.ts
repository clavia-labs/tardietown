import { createInterface } from "node:readline/promises"

const providers = {
  openrouter: "OPENROUTER_API_KEY",
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY"
} as const
type Provider = keyof typeof providers
type Settings = { provider: string; model: string; configured: boolean; error?: string }
const args = process.argv.slice(2).filter(arg => arg !== "--")
const option = (name: string) => {
  const index = args.indexOf(name)
  return index < 0 ? undefined : args[index + 1]
}

if (args.includes("--help") || args.includes("-h")) {
  console.log("Usage: bun run model:setup [--provider <openrouter|openai|anthropic>] [--model <model-id>] [--replace-key]")
  console.log("Run without options for guided setup. Start the server first with bun run dev.")
  console.log("The provider API key comes from its environment variable or a hidden prompt.")
  process.exit(0)
}
const knownFlags = new Set(["--provider", "--model", "--replace-key"])
if (args.some(arg => arg.startsWith("-") && !knownFlags.has(arg)) ||
    ["--provider", "--model"].some(flag => args.includes(flag) && (!option(flag) || option(flag)?.startsWith("--")))) {
  console.error("Invalid options. Run bun run model:setup --help for usage.")
  process.exit(1)
}
const port = Number(process.env.TOWN_PORT ?? 4244)
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("TOWN_PORT must be a valid port number.")
  process.exit(1)
}

// Raw mode prevents the key appearing in the terminal or shell history.
async function hiddenKey(envName: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY || !process.stdin.setRawMode)
    throw Error(`Set ${envName} in your environment, or run this command in an interactive terminal.`)
  process.stdout.write("API key (hidden): ")
  return new Promise((resolve, reject) => {
    let value = ""
    const finish = (error?: Error) => {
      process.stdin.off("data", onData)
      process.stdin.setRawMode(false)
      process.stdin.pause()
      process.stdout.write("\n")
      if (error) reject(error)
      else resolve(value.trim())
    }
    const onData = (chunk: Buffer) => {
      for (const character of chunk.toString("utf8")) {
        if (character === "\u0003" || character === "\u0004") return finish(Error("Setup cancelled."))
        if (character === "\r" || character === "\n") return finish()
        if (character === "\u007f" || character === "\b") value = value.slice(0, -1)
        else if (character >= " " && character !== "\u001b") value += character
      }
    }
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.on("data", onData)
  })
}

async function main() {
  const endpoint = `http://127.0.0.1:${port}/api/settings`
  let current: Settings
  try {
    const response = await fetch(endpoint)
    if (!response.ok) throw Error()
    current = await response.json() as Settings
  } catch {
    throw Error(`Start the town server with bun run dev, then retry (http://127.0.0.1:${port}).`)
  }

  const rl = process.stdin.isTTY && process.stdout.isTTY
    ? createInterface({ input: process.stdin, output: process.stdout })
    : undefined
  let provider: Provider
  let model: string
  try {
    const requested = option("--provider")
    if (requested && !Object.hasOwn(providers, requested)) throw Error("Choose openrouter, openai, or anthropic.")
    if (requested) provider = requested as Provider
    else {
      if (!rl) throw Error("Pass --provider and --model in a noninteractive terminal.")
      const choices = Object.keys(providers) as Provider[]
      const selected = Math.max(1, choices.indexOf(current.provider as Provider) + 1)
      console.log("Model provider:")
      choices.forEach((choice, index) => console.log(`  ${index + 1}. ${choice}${choice === current.provider ? " (current)" : ""}`))
      const answer = (await rl.question(`Choose 1-${choices.length} [${selected}]: `)).trim()
      provider = choices[Number(answer || selected) - 1]!
      if (!provider) throw Error("Choose a provider from the list.")
    }
    const requestedModel = option("--model")
    if (requestedModel) model = requestedModel.trim()
    else {
      if (!rl) throw Error("Pass --provider and --model in a noninteractive terminal.")
      const previous = provider === current.provider ? current.model : ""
      const answer = (await rl.question(`Model ID${previous ? ` [${previous}]` : ""}: `)).trim()
      model = answer || previous
    }
    if (!model || model.length > 200 || /[\r\n]/.test(model)) throw Error("Enter a valid model ID.")
  } finally {
    rl?.close()
  }

  const envName = providers[provider]
  const reuseKey = current.configured && current.provider === provider && !args.includes("--replace-key")
  let apiKey = reuseKey ? undefined : process.env[envName]?.trim()
  if (!reuseKey && !apiKey) {
    apiKey = await hiddenKey(envName)
    if (!apiKey) throw Error("API key cannot be empty.")
  }
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, model, ...(apiKey ? { apiKey } : {}) })
  })
  const result = await response.json() as Settings
  if (!response.ok) throw Error(result.error ?? "Could not save model settings.")
  console.log(`Model set to ${result.provider}/${result.model} for new and reopened towns.`)
}

try { await main() }
catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
