import type { McpConnectionInfo } from "./packages/mcp-types"
import type { TownPackage } from "./packages/types"
import type { Artifact } from "./actors/artifacts/store"
import type { ForumMessage, ForumPolicy } from "./actors/resident/components/forum"
import type { ForumSessionState } from "./actors/forum/session"
import type { shuffleDuckPalettes } from "./scene/duckPalettes"
import type { Resident, WorldConfig } from "./world"
import type { Mission, MissionPolicy } from "./actors/forum/missions/store"
import type { LibraryEntry, LibraryPolicy } from "./actors/library/store"

export const DEFAULT_COLONY_SERVER_PORT = 4244
export const DEFAULT_SERVER_TURN_TIMEOUT_MS = 300000
export const DEFAULT_SERVER_MAX_COLONIES = 20
export const DEFAULT_SERVER_MAX_TURNS = 1000
export const DEFAULT_SERVER_MAX_TOOL_CALLS = 50
export const DEFAULT_SERVER_MAX_TIMEOUT_MS = 900000
export const DEFAULT_SERVER_HEARTBEAT_MS = 15000
export interface ServerColonyOptions {
  config: WorldConfig
  maxConcurrent: number
  maxToolCalls: number
  maxTurns: number
  budgetUsd?: number
}
export interface ColonySnapshot {
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
export interface ColonyServerInfo {
  model: string
  maxAgents: number
  maxColonies: number
  maxTurns: number
  maxToolCalls: number
  maxTimeoutMs: number
  defaultTimeoutMs: number
  missionPolicy: MissionPolicy
  libraryPolicy: LibraryPolicy
}
