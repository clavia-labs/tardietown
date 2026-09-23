import type { McpConnectionInfo } from "./packages/mcp-types"
import type { TownPackage } from "./packages/types"
import type { Artifact } from "../actors/artifacts/store"
import type { ForumMessage, ForumPolicy } from "../actors/resident/components/forum"
import type { ForumSessionState } from "../actors/forum/session"
import type { shuffleDuckPalettes } from "./scene/duckPalettes"
import type { Resident, WorldConfig } from "./world"
import type { Mission, MissionPolicy } from "../actors/forum/missions/store"
import type { LibraryEntry, LibraryPolicy } from "../actors/library/store"

export const DEFAULT_TOWN_SERVER_PORT = 4244
export const DEFAULT_SERVER_TURN_TIMEOUT_MS = 300000
export const DEFAULT_SERVER_MAX_TOWNS = 20
export const DEFAULT_SERVER_MAX_TURNS = 1000
export const DEFAULT_SERVER_MAX_TOOL_CALLS = 50
export const DEFAULT_SERVER_MAX_TIMEOUT_MS = 900000
export const DEFAULT_SERVER_HEARTBEAT_MS = 15000
export interface ServerTownOptions {
  config: WorldConfig
  maxConcurrent: number
  maxToolCalls: number
  maxTurns: number
  budgetUsd?: number
}
export interface TownSnapshot {
  inbox?: readonly import("../actors/human/actor").HumanRequest[]
  mcp?: readonly McpConnectionInfo[]
  packages?: readonly TownPackage[]
  id: string
  config: WorldConfig
  residents: readonly Resident[]
  palettes: ReturnType<typeof shuffleDuckPalettes>
  messages: readonly ForumMessage[]
  karma: Readonly<Record<string, number>>
  artifacts?: readonly Artifact[]
  missions?: readonly Mission[]
  library?: readonly LibraryEntry[]
  policy: ForumPolicy
  state: ForumSessionState
  model: string
  maxConcurrent: number
  maxTurns: number
}
export interface TownServerInfo {
  model: string
  maxAgents: number
  maxTowns: number
  maxTurns: number
  maxToolCalls: number
  maxTimeoutMs: number
  defaultTimeoutMs: number
  missionPolicy: MissionPolicy
  libraryPolicy: LibraryPolicy
}

export interface TownHistory {
  start: number
  end: number
  at: number
  snapshot: TownSnapshot
  documents: readonly import("../actors/artifacts/store").ArtifactDocument[]
  references: readonly import("../actors/library/store").LibraryDocument[]
  files: Record<string, readonly import("../actors/forum/missions/workspace").MissionFile[]>
}
export interface TownTimeline {
  start: number
  end: number
  at?: number | undefined
  loading?: boolean | undefined
  error?: string | undefined
  select: (at: number | undefined) => void
}
