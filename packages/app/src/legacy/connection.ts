import {
  makeActorClient,
  type ActorCallHandle
} from "@clavia/tardigrade-client"
import { agentMethods } from "tardie/agent"
import {
  boardPrompt,
  type Post,
  type Resident,
  type WorldConfig
} from "../town/world"

export function waitFor(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason)
      return
    }
    const abort = () => {
      clearTimeout(timer)
      reject(signal.reason)
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort)
      resolve()
    }, ms)
    signal.addEventListener("abort", abort, { once: true })
  })
}

export function liveConnection(
  config: WorldConfig,
  room: string,
  transport: typeof globalThis.fetch = globalThis.fetch
) {
  const client = makeActorClient({
    baseUrl: config.apiUrl,
    methods: agentMethods,
    fetch: transport,
    ...(config.token ? { token: config.token } : {})
  })
  const threads = new Map<string, string>()
  return {
    async post(
      resident: Resident,
      posts: readonly Post[],
      residents: readonly Resident[],
      signal: AbortSignal
    ): Promise<string> {
      const actor = `${room}-${resident.id}`
      let thread = threads.get(actor)
      if (thread === undefined) {
        const allocated = await client.allocateRoot(actor, "messageboard")
        thread = allocated.thread
        threads.set(actor, thread)
      }
      signal.throwIfAborted()
      let handle: ActorCallHandle<"message"> | undefined
      try {
        handle = await client.call(actor, thread, "message", {
          id: crypto.randomUUID(),
          input: { text: boardPrompt(resident, config, posts, residents) },
          timeoutMs: config.timeoutMs
        })
        const started = Date.now()
        for (;;) {
          signal.throwIfAborted()
          const state = await client.state(handle)
          if (state.status === "completed") return state.output
          if (state.status === "failed") throw new Error(state.error)
          if (state.status === "cancelled")
            throw new Error(state.reason ?? "The agent turn was cancelled.")
          if (Date.now() - started >= config.timeoutMs)
            throw new Error(
              `The agent did not finish within ${config.timeoutMs / 1000} seconds.`
            )
          await waitFor(config.pollIntervalMs, signal)
        }
      } catch (error) {
        if (handle !== undefined) {
          await client.cancel(handle, {
            reason: signal.aborted ? "Swarm paused" : "Swarm turn stopped"
          })
        }
        throw error
      }
    }
  }
}
