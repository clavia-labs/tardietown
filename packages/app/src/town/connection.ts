import type { Artifact, ArtifactDocument } from "./workspace/artifacts/store"
import type {
  ColonySnapshot,
  ServerColonyOptions,
  ColonyServerInfo
} from "./protocol"
import type { ForumResult } from "./agent/components/forum"
import type { UserForumCommand } from "./forum/user"
import type { LibraryDocument } from "./library/store"

export interface ColonyAccess {
  id: string
  token: string
}
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init)
  const body = await response.json()
  if (!response.ok)
    throw new Error(body.error ?? `Colony server returned ${response.status}`)
  return body as T
}
export const serverInfo = () => request<ColonyServerInfo>("/api/colony-config")
export const createServerColony = (options: ServerColonyOptions) =>
  request<ColonyAccess & { snapshot: ColonySnapshot }>("/api/colonies", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options)
  })
export function serverConnection(access: ColonyAccess) {
  const path = `/api/colonies/${encodeURIComponent(access.id)}`
  const headers = {
    Authorization: `Bearer ${access.token}`,
    "Content-Type": "application/json"
  }
  return {
    readArtifact: (filePath: string, revision?: number) => request<{ artifact: ArtifactDocument; history: Artifact[] }>(`${path}/artifact?path=${encodeURIComponent(filePath)}${revision === undefined ? "" : `&revision=${revision}`}`, { headers }),
    readLibrary: (id: string) => request<LibraryDocument>(`${path}/library?id=${encodeURIComponent(id)}`, { headers }),
    snapshot: () => request<ColonySnapshot>(path, { headers }),
    pause: () =>
      request<ColonySnapshot>(`${path}/pause`, { method: "POST", headers }),
    resume: () =>
      request<ColonySnapshot>(`${path}/resume`, { method: "POST", headers }),
    stop: () => request(`${path}`, { method: "DELETE", headers }),
    post: (command: UserForumCommand, operationId: string) =>
      request<ForumResult>(`${path}/post`, {
        method: "POST",
        headers,
        body: JSON.stringify({ command, operationId })
      }),
    async watch(
      onSnapshot: (snapshot: ColonySnapshot) => void,
      signal: AbortSignal
    ) {
      const response = await fetch(`${path}/events`, { headers, signal })
      if (!response.ok || !response.body)
        throw new Error(
          "Could not connect to the colony. Reconnect to try again."
        )
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let pending = ""
      try {
        for (;;) {
          const chunk = await reader.read()
          if (chunk.done) break
          pending += decoder.decode(chunk.value, { stream: true })
          let end: number
          while ((end = pending.indexOf("\n\n")) >= 0) {
            const event = pending.slice(0, end)
            pending = pending.slice(end + 2)
            if (event.startsWith("data: "))
              onSnapshot(JSON.parse(event.slice(6)) as ColonySnapshot)
          }
        }
        if (!signal.aborted)
          throw new Error(
            "Colony connection closed. Reconnect to see its current state."
          )
      } finally {
        await reader.cancel().catch(() => undefined)
        reader.releaseLock()
      }
    }
  }
}
