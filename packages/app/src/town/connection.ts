import type { McpCommand, McpUpdateResult } from "./packages/mcp-types"
import type { ResidentEventPage } from "../actors/resident/events"
import type { PackageUpdate } from "./packages/types"
import type { MissionFile, MissionFileInfo } from "../actors/forum/missions/workspace"
import type { MissionResult } from "../actors/forum/missions/store"
import type { Artifact, ArtifactDocument } from "../actors/artifacts/store"
import type {
  TownSnapshot,
  ServerTownOptions,
  TownServerInfo
} from "./protocol"
import type { ForumResult } from "../actors/resident/components/forum"
import type { UserForumCommand } from "../actors/forum/user"
import type { LibraryDocument } from "../actors/library/store"

export interface TownAccess {
  id: string
  token: string
}
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init)
  const body = await response.json() as { error?: string }
  if (!response.ok)
    throw new Error(body.error ?? `Town server returned ${response.status}`)
  return body as T
}
export interface SavedTown { id: string; name: string; premise: string; residents: number; createdAt: number; updatedAt: number; running: boolean }
export const deleteSavedTown = (id: string) => request<{ ok: boolean }>(`/api/towns/${encodeURIComponent(id)}`, { method: "DELETE" })
export const listSavedTowns = () => request<SavedTown[]>("/api/towns")
export const openSavedTown = (id: string) => request<TownAccess & { snapshot: TownSnapshot }>(`/api/towns/${encodeURIComponent(id)}/open`, { method: "POST" })
export const serverInfo = () => request<TownServerInfo>("/api/town-config")
export const createServerTown = (options: ServerTownOptions) =>
  request<TownAccess & { snapshot: TownSnapshot }>("/api/towns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options)
  })
export function serverConnection(access: TownAccess) {
  const path = `/api/towns/${encodeURIComponent(access.id)}`
  const headers = {
    Authorization: `Bearer ${access.token}`,
    "Content-Type": "application/json"
  }
  return {
    inboxAction: (input: { id: string; action: "answer" | "connect"; answer?: string }) => request<{ authorizationUrl?: string }>(`${path}/inbox`, { method: "POST", headers, body: JSON.stringify(input) }),
    listMissionFiles: (missionId: string) => request<MissionFileInfo[]>(`${path}/workspace?missionId=${encodeURIComponent(missionId)}`, { headers }),
    readMissionFile: (missionId: string, filePath: string) => request<MissionFile>(`${path}/workspace?missionId=${encodeURIComponent(missionId)}&path=${encodeURIComponent(filePath)}`, { headers }),
    reviewMission: (missionId: string, reviewId: string, decision: "complete" | "needs_work", reason: string, operationId: string) => request<MissionResult>(`${path}/review`, { method: "POST", headers, body: JSON.stringify({ missionId, reviewId, decision, reason, operationId }) }),
    readArtifact: (filePath: string, revision?: number) => request<{ artifact: ArtifactDocument; history: Artifact[] }>(`${path}/artifact?path=${encodeURIComponent(filePath)}${revision === undefined ? "" : `&revision=${revision}`}`, { headers }),
    uploadLibrary: (title: string, content: string, operationId: string) => request(`${path}/library`, { method: "POST", headers, body: JSON.stringify({ title, content, operationId }) }),
    historyRange: () => request<{ start: number; end: number }>(`${path}/history`, { headers }),
    history: (at: number) => request<import("./protocol").TownHistory>(`${path}/history?at=${at}`, { headers }),
    readLibrary: (id: string) => request<LibraryDocument>(`${path}/library?id=${encodeURIComponent(id)}`, { headers }),
    snapshot: () => request<TownSnapshot>(path, { headers }),
    readResidentEvents: (resident: string, cursor = 0) => request<ResidentEventPage>(`${path}/resident-events?resident=${encodeURIComponent(resident)}&cursor=${cursor}`, { headers }),
    updateMcp: (command: McpCommand) => request<McpUpdateResult>(`${path}/mcp`, { method: "POST", headers, body: JSON.stringify(command) }),
    updatePackage: (update: PackageUpdate) => request<TownSnapshot>(`${path}/packages`, { method: "POST", headers, body: JSON.stringify(update) }),
    addBudget: (amountUsd: number, operationId: string) => request<TownSnapshot>(`${path}/budget`, { method: "POST", headers, body: JSON.stringify({ amountUsd, operationId }) }),
    pause: () =>
      request<TownSnapshot>(`${path}/pause`, { method: "POST", headers }),
    resume: () =>
      request<TownSnapshot>(`${path}/resume`, { method: "POST", headers }),
    stop: () => request(`${path}/stop`, { method: "DELETE", headers }),
    post: (command: UserForumCommand, operationId: string) =>
      request<ForumResult>(`${path}/post`, {
        method: "POST",
        headers,
        body: JSON.stringify({ command, operationId })
      }),
    async watch(
      onSnapshot: (snapshot: TownSnapshot) => void,
      signal: AbortSignal
    ) {
      const response = await fetch(`${path}/events`, { headers, signal })
      if (!response.ok || !response.body)
        throw new Error(
          "Could not connect to the town. Reconnect to try again."
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
              onSnapshot(JSON.parse(event.slice(6)) as TownSnapshot)
          }
        }
        if (!signal.aborted)
          throw new Error(
            "Town connection closed. Reconnect to see its current state."
          )
      } finally {
        await reader.cancel().catch(() => undefined)
        reader.releaseLock()
      }
    }
  }
}
