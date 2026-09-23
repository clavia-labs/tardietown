import { workspaceSqlFile } from "tardie/bun/workspace"
import type { shuffleDuckPalettes } from "../src/town/scene/duckPalettes"
import { Database } from "bun:sqlite"
import { existsSync, readFileSync, readdirSync, mkdirSync, copyFileSync, chmodSync } from "node:fs"
import { dirname, join } from "node:path"
import type { Event } from "tardie/core/event"
import type { ServerTownOptions } from "../src/town/protocol"
import type { Resident } from "../src/town/world"
import type { ForumSessionState } from "../src/actors/forum/session"
import type { ForumMessage } from "../src/actors/resident/components/forum"
import type { VoteChanged } from "../src/actors/forum/events"
import type { Mission } from "../src/actors/forum/missions/store"
import type { MissionFile } from "../src/actors/forum/missions/workspace"
import type { ArtifactDocument } from "../src/actors/artifacts/store"
import type { LibraryDocument } from "../src/actors/library/store"
import type { SavedConnection } from "./mcp/connections"

export interface TownMetadata extends ServerTownOptions { id: string; createdAt: number; residents: readonly Resident[]; palettes?: ReturnType<typeof shuffleDuckPalettes> }
export interface SavedTownSummary { id: string; name: string; premise: string; residents: number; createdAt: number; updatedAt: number; running: boolean }
interface LogRow { at: number; type: string; data: any }
function rows(path: string): LogRow[] {
  if (!existsSync(path)) return []
  // An interrupted final append can leave a partial last line.
  const lines = readFileSync(path, "utf8").split("\n")
  return lines.flatMap((line, index) => {
    if (!line.trim()) return []
    try { return [JSON.parse(line) as LogRow] } catch { if (index === lines.length - 1) return []; throw Error("Town event log is damaged.") }
  })
}
export class TownArchive {
  readonly directory: string
  readonly metadata: TownMetadata
  readonly events: LogRow[]
  constructor(root: string, id: string, private readonly cutoff = Infinity) {
    if (!/^[a-zA-Z0-9-]+$/.test(id)) throw Error("Invalid town ID.")
    this.directory = join(root, "towns", id)
    this.metadata = JSON.parse(readFileSync(join(this.directory, "town.json"), "utf8"))
    if (this.metadata.id !== id || !Array.isArray(this.metadata.residents) || !this.metadata.config?.name) throw Error("Invalid saved town.")
    this.events = rows(join(this.directory, "events.jsonl")).filter(event => event.at <= cutoff)
  }
  summary(): SavedTownSummary {
    const m = this.metadata
    return { id: m.id, name: m.config.name, premise: m.config.premise, residents: m.residents.length, createdAt: m.createdAt, updatedAt: this.events.at(-1)?.at ?? m.createdAt, running: false }
  }
  private actorPaths(actor: string, thread: string) {
    const directories = [join(this.directory, "runtime"), ...this.events.filter(event => event.type === "TownRestored" && /^[a-zA-Z0-9-]+$/.test(event.data.generation)).map(event => join(this.directory, "runtime", event.data.generation))]
    return directories.map(directory => join(directory, `${actor}-${encodeURIComponent(thread)}.sqlite`)).filter(existsSync)
  }
  actorEvents(actor: string, thread: string, latestOnly = false): Event[] {
    if (this.cutoff !== Infinity) {
      const filename = actor === "resident" ? encodeURIComponent(thread) : `${actor}-${encodeURIComponent(thread)}`
      const path = join(this.directory, "actors", `${filename}.jsonl`)
      if (!existsSync(path)) return []
      return readFileSync(path, "utf8").split("\n").filter(Boolean).flatMap(line => {
        try { const row = JSON.parse(line); return row.recordedAt <= this.cutoff ? [row.event as Event] : [] } catch { return [] }
      })
    }
    const paths = this.actorPaths(actor, thread)
    return (latestOnly ? paths.slice(-1) : paths).flatMap(path => {
      const db = new Database(path, { readonly: true })
      try { return db.query<{ event: string }, []>("SELECT event FROM events ORDER BY seq").all().map(row => JSON.parse(row.event) as Event).filter(event => this.cutoff === Infinity || (typeof event.at === "number" && event.at <= this.cutoff)) } finally { db.close() }
    })
  }
  copyResidentWorkspace(thread: string, target: string) {
    const source = this.actorPaths("resident", thread).at(-1)
    if (!source) return
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 })
    const old = new Database(source, { readonly: true }), next = new Database(target)
    try {
      const schema = old.query<{ sql: string }, []>("SELECT sql FROM sqlite_master WHERE type='table' AND name='workspace'").get()
      if (schema) {
        next.exec(schema.sql)
        const insert = next.query("INSERT INTO workspace(id,value,value_type) VALUES (?,?,?)")
        next.transaction(() => {
          for (const row of old.query<{ id: string; value: Uint8Array; value_type: number }, []>("SELECT id,value,value_type FROM workspace").all()) insert.run(row.id, row.value, row.value_type)
        })()
      }
    } finally { old.close(); next.close() }
    const oldSql = workspaceSqlFile(source)
    if (existsSync(oldSql)) {
      const targetSql = workspaceSqlFile(target)
      copyFileSync(oldSql, targetSql); chmodSync(targetSql, 0o600)
      if (existsSync(`${oldSql}-wal`)) { copyFileSync(`${oldSql}-wal`, `${targetSql}-wal`); chmodSync(`${targetSql}-wal`, 0o600) }
    }
  }
  rebuild() {
    const messages = new Map<string, ForumMessage>()
    const votes: VoteChanged[] = []
    const missions = new Map<string, Mission>()
    let session: ForumSessionState | undefined
    let connections: SavedConnection[] = []
    const grants = new Map<string, number>()
    for (const event of this.events) {
      if (event.type === "TownCreated") {
        for (const message of event.data.messages ?? []) messages.set(message.id, message)
        for (const mission of event.data.missions ?? []) missions.set(mission.id, mission)
      }
      if (event.type === "MessagePosted") messages.set(event.data.message.id, event.data.message)
      if (event.type === "VoteChanged") votes.push(event.data)
      if (event.type === "MissionsChanged") for (const mission of event.data) missions.set(mission.id, mission)
      if (event.type === "SessionChanged" || event.type === "TownClosed") session = event.data
      if (event.type === "ConnectionsChanged") connections = event.data
      if (event.type === "BudgetAdded") grants.set(event.data.operationId, event.data.amount)
    }
    for (const event of this.actorEvents("connections", "connections")) {
      const result = event.output as { ok?: boolean; connections?: SavedConnection[] } | undefined
      if (event.type === "connection-requestCompleted" && result?.ok && result.connections) connections = result.connections
    }
    const workspace = new Map<string, Map<string, MissionFile>>()
    // Service outcomes recover committed changes even if an application log export failed.
    const forum = this.actorEvents("forum", "forum")
    const requests = new Map<string, any>()
    for (const event of forum) {
      if (event.type.endsWith("Requested")) requests.set(String(event.id), event.payload)
      const result = event.output as any
      if (!event.type.endsWith("Completed") || !result?.ok) continue
      if (result.message) messages.set(result.message.id, result.message)
      // Prefer the application mission history: it includes expiry transitions too.
      if (result.mission && !missions.has(result.mission.id)) missions.set(result.mission.id, result.mission)
      const request = requests.get(String(event.id))
      if (result.file && request?.command?.missionId) {
        const files = workspace.get(request.command.missionId) ?? new Map<string, MissionFile>()
        const old = files.get(result.file.path)
        if (!old || old.revision < result.file.revision) files.set(result.file.path, result.file)
        workspace.set(request.command.missionId, files)
      }
    }
    const artifacts: ArtifactDocument[] = []
    const visit = (directory: string) => {
      if (!existsSync(directory)) return
      for (const item of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, item.name)
        if (item.isDirectory()) visit(path)
        else if (item.isFile() && item.name.endsWith(".json")) { const file = JSON.parse(readFileSync(path, "utf8")); if (file.at <= this.cutoff) artifacts.push(file) }
      }
    }
    visit(join(this.directory, "artifacts"))
    const library = new Map<string, LibraryDocument>()
    requests.clear()
    for (const event of this.actorEvents("library", "library")) {
      if (event.type === "library-requestRequested") requests.set(String(event.id), event.payload)
      const result = event.output as any, request = requests.get(String(event.id))
      if (event.type === "library-requestCompleted" && result?.kind === "add" && result.ok && request?.kind === "add") library.set(result.entry.id, { ...result.entry, content: request.content })
    }
    return { messages: [...messages.values()].sort((a, b) => a.sequence - b.sequence), votes, missions: [...missions.values()], workspace, artifacts, library: [...library.values()], session, connections, grants }
  }
}
export function savedTowns(root: string): SavedTownSummary[] {
  const directory = join(root, "towns")
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true }).filter(entry => entry.isDirectory()).flatMap(entry => {
    try { return [new TownArchive(root, entry.name).summary()] } catch { return [] }
  }).sort((a, b) => b.updatedAt - a.updatedAt)
}
