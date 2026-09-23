import { HumanInbox, createHumanInboxActor, inboxLayer, type HumanCommand, type HumanRequest, type HumanResult } from "../src/actors/human/actor"
import { humanLayer } from "../src/actors/resident/components/human"
import { MCP_PRESETS } from "../src/town/packages/presets"
import { FetchHttpClient } from "effect/unstable/http"
import { TownArchive, savedTowns } from "./archive"
import { CredentialStore } from "./mcp/credentials"
import { sqliteCredentialsLayer } from "./mcp/credentials-bun"
import { createConnectionsActor, connectionsLayer } from "../src/actors/connections/actor"
import type { McpUpdateResult } from "../src/town/packages/mcp-types"
import { McpConnections } from "./mcp/connections"
import { mcpLayer } from "../src/actors/resident/components/code/mcp"
import type { McpCommand } from "../src/town/packages/mcp-types"
import { residentEvent } from "./resident-events"
import type { ResidentEventPage } from "../src/actors/resident/events"
import { TownPackages } from "./packages"
import type { PackageUpdate } from "../src/town/packages/types"
import { TownBudget, validBudget } from "../src/town/budget"
import { hostBackend } from "tardie/bun/create-host"
import { usageIn } from "tardie/agent"
import { TownLogs } from "./logs"
import { createForumActor, forumStateLayer } from "../src/actors/forum/actor"
import type { UserForumCommand } from "../src/actors/forum/user"
import { mkdirSync, writeFileSync, renameSync, rmSync } from "node:fs"
import { dirname, join } from "node:path"
import { ArtifactStore, type ArtifactPolicy } from "../src/actors/artifacts/store"
import { artifactLayer } from "../src/actors/resident/components/artifacts"
import { createArtifactActor, artifactWorkspaceLayer, type ArtifactActorDispatcher } from "../src/actors/artifacts/actor"
import { MissionStore, DEFAULT_MISSION_POLICY, type MissionPolicy, type MissionResult, type MissionCommand } from "../src/actors/forum/missions/store"
import { missionLayer } from "../src/actors/resident/components/missions"
import { LibraryStore, DEFAULT_LIBRARY_POLICY, type LibraryPolicy } from "../src/actors/library/store"
import { createLibraryActor, libraryCollectionLayer, type LibraryActorDispatcher } from "../src/actors/library/actor"
import { libraryLayer } from "../src/actors/resident/components/library"
import { Effect, Layer, ManagedRuntime, Redacted } from "effect"
import type { LanguageModel } from "effect/unstable/ai"
import type { ModelLock } from "tardie/model/lock"
import { createBunHost } from "tardie/bun"
import { createResearchActor } from "../src/actors/resident/actor"
import { exaLayer, type ExaOptions } from "../src/actors/resident/components/code/exa"
import type { WorkspacePolicy } from "tardie/code"
import { MemoryForum } from "../src/actors/forum/store"
import { ForumSession } from "../src/actors/forum/session"
import { makeResidents, DEFAULT_MAX_AGENTS } from "../src/town/world"
import { shuffleDuckPalettes } from "../src/town/scene/duckPalettes"
import { createMissionForum } from "../src/actors/forum/user"
import { decodeForumCommand, forumLayer, type ForumService, type ForumResult } from "../src/actors/resident/components/forum"
import {
  DEFAULT_SERVER_MAX_TOWNS,
  DEFAULT_SERVER_MAX_TURNS,
  DEFAULT_SERVER_MAX_TOOL_CALLS,
  DEFAULT_SERVER_MAX_TIMEOUT_MS,
  DEFAULT_SERVER_TURN_TIMEOUT_MS,
  DEFAULT_SERVER_HEARTBEAT_MS,
  type TownSnapshot,
  type TownServerInfo,
  type ServerTownOptions
} from "../src/town/protocol"

export interface TownServerOptions {
  dataDirectory?: string
  artifactDirectory?: string
  artifactPolicy?: Partial<ArtifactPolicy>
  missionPolicy?: Partial<MissionPolicy>
  libraryPolicy?: Partial<LibraryPolicy>
  exa?: ExaOptions
  workspacePolicy?: Partial<WorkspacePolicy>

  layers: Layer.Layer<LanguageModel.LanguageModel | ModelLock>
  model: string
  modelServices?: () => { layers: TownServerOptions["layers"]; model: string }
  maxAgents?: number | undefined
  maxTowns?: number | undefined
  maxTurns?: number | undefined
  maxToolCalls?: number | undefined
  maxTimeoutMs?: number | undefined
  defaultTimeoutMs?: number | undefined
  heartbeatMs?: number | undefined
}

export function createTownService(options: TownServerOptions) {
  const info: TownServerInfo = {
    model: options.model,
    maxAgents: options.maxAgents ?? DEFAULT_MAX_AGENTS,
    maxTowns: options.maxTowns ?? DEFAULT_SERVER_MAX_TOWNS,
    maxTurns: options.maxTurns ?? DEFAULT_SERVER_MAX_TURNS,
    maxToolCalls: options.maxToolCalls ?? DEFAULT_SERVER_MAX_TOOL_CALLS,
    maxTimeoutMs: options.maxTimeoutMs ?? DEFAULT_SERVER_MAX_TIMEOUT_MS,
    defaultTimeoutMs: options.defaultTimeoutMs ?? DEFAULT_SERVER_TURN_TIMEOUT_MS,
    missionPolicy: Object.freeze({
      ...DEFAULT_MISSION_POLICY,
      ...options.missionPolicy
    }),
    libraryPolicy: Object.freeze({
      ...DEFAULT_LIBRARY_POLICY,
      ...options.libraryPolicy
    })
  }
  const heartbeatMs = options.heartbeatMs ?? DEFAULT_SERVER_HEARTBEAT_MS
  if (
    [
      ...Object.values(info).filter(
        (value): value is number => typeof value === "number"
      ),
      info.missionPolicy.claimTtlMs,
      ...Object.values(info.libraryPolicy),
      heartbeatMs
    ].some((value) => !Number.isSafeInteger(value) || value < 1) ||
    info.defaultTimeoutMs > info.maxTimeoutMs
  )
    throw new Error("Invalid town server limits.")
  type Record = {
    token: string
    inboxAction: (input: unknown, callback: string) => Promise<unknown>
    mcp: McpConnections
    connectionCommand: (command: McpCommand, callback: string) => Promise<McpUpdateResult>
    connectionCallback: (params: URLSearchParams) => Promise<void>
    logEvent: (type: string, data: unknown) => void
    updatePackage: (update: PackageUpdate) => Promise<void>
    readEvents: (resident: string, cursor: number) => Promise<ResidentEventPage>
    packages: TownPackages
    budget: TownBudget
    session: ForumSession
    board: MemoryForum
    artifacts: ArtifactStore
    missions: MissionStore
    library: LibraryStore
    post: (command: UserForumCommand, operationId: string) => Promise<ForumResult>
    review: (command: Extract<MissionCommand, { type: "vote_mission_completion" }>, operationId: string) => Promise<MissionResult>
    readArtifact: (path: string, revision?: number) => Promise<unknown>
    uploadLibrary: (title: string, content: string, operationId: string) => Promise<unknown>
    readLibrary: (id: string) => Promise<unknown>
    closeMissionRuntime: () => void
    snapshot: () => TownSnapshot
    viewers: Set<() => void>
  }
  const towns = new Map<string, Record>()
  const streams = new Set<() => void>()
  let creating = 0
  let closed = false
  const integer = (value: unknown, max: number) =>
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= max
  const json = (value: unknown, status = 200) =>
    Response.json(value, { status, headers: { "Cache-Control": "no-store" } })
  const create = async (input: ServerTownOptions, archive?: TownArchive) => {
    if (closed) throw new Error("Town server is closing.")
    if (towns.size + creating >= info.maxTowns)
      throw new Error(
        `Server limit reached: ${info.maxTowns} towns. Stop an existing town first.`
      )
    if (
      !input ||
      !input.config ||
      !validBudget(input.budgetUsd ?? 1) ||
      typeof input.config.name !== "string" ||
      !input.config.name.trim() ||
      typeof input.config.premise !== "string" ||
      !input.config.premise.trim() ||
      !integer(input.config.count, info.maxAgents) ||
      !integer(input.maxConcurrent, info.maxAgents) ||
      !integer(input.maxToolCalls, info.maxToolCalls) ||
      !integer(input.maxTurns, info.maxTurns) ||
      input.maxTurns < input.config.count ||
      !integer(input.config.timeoutMs, info.maxTimeoutMs) ||
      !integer(input.config.postWords, Number.MAX_SAFE_INTEGER) ||
      !integer(input.config.bubbleCharacters, Number.MAX_SAFE_INTEGER)
    )
      throw new Error(
        "Invalid town settings. Check the server's published limits."
      )
    creating++
    const provisionalHosts: { close: () => Promise<void> }[] = []
    let established = false
    try {
      const modelServices = options.modelServices?.() ?? { layers: options.layers, model: options.model }
      const id = archive?.metadata.id ?? crypto.randomUUID()
      const restored = archive?.rebuild()
      const generation = archive ? `restored-${Date.now()}-${crypto.randomUUID()}` : undefined
      const token = crypto.randomUUID()
      const config = { ...input.config }
      const residents = archive?.metadata.residents ?? makeResidents(config.count, info.maxAgents)
      const palettes = archive?.metadata.palettes ?? shuffleDuckPalettes()
      const logs = options.dataDirectory ? new TownLogs(options.dataDirectory, id, {
        id, createdAt: Date.now(), config, residents, palettes, model: modelServices.model,
        maxConcurrent: input.maxConcurrent, maxTurns: input.maxTurns, maxToolCalls: input.maxToolCalls, budgetUsd: input.budgetUsd ?? 1
      }, generation) : undefined
      const board = createMissionForum(config.premise)
      if (restored) board.restoreHistory(restored.messages, restored.votes)
      const artifactDirectory = options.artifactDirectory ? join(options.artifactDirectory, id) : logs ? join(logs.directory, "artifacts") : undefined
      const artifacts = new ArtifactStore(options.artifactPolicy, artifactDirectory ? (file) => {
        const directory = join(artifactDirectory, file.path.slice(1))
        mkdirSync(directory, { recursive: true })
        const target = join(directory, `${file.revision}.json`)
        writeFileSync(`${target}.tmp`, JSON.stringify(file), { mode: 0o600 })
        renameSync(`${target}.tmp`, target)
      } : undefined)
      const missions = new MissionStore(
        board,
        board.snapshot()[0]!.id,
        residents.map(({ id }) => id),
        artifacts,
        info.missionPolicy,
        Date.now,
        logs ? (missionId, file) => {
          const target = join(logs.directory, "missions", missionId, file.path)
          mkdirSync(dirname(target), { recursive: true, mode: 0o700 })
          writeFileSync(`${target}.tmp`, file.content, { mode: 0o600 })
          renameSync(`${target}.tmp`, target)
        } : undefined
      )
      const library = new LibraryStore(info.libraryPolicy)
      if (restored) {
        artifacts.restoreHistory(restored.artifacts)
        library.restoreHistory(restored.library)
        missions.restoreHistory(restored.missions)
        missions.workspace.restoreHistory(restored.workspace)
      }
      const forumHost = await createBunHost({
        actor: createForumActor(),
        ...(logs?.host("forum") ?? { storage: ":memory:" }),
        driver: { maxConcurrentThreads: 1 },
        layersFor: () => forumStateLayer(board, missions)
      })
      provisionalHosts.push(forumHost)
      const forumThread = await forumHost.allocateRootThread({ instance: id, name: "forum" })
      const forumDispatcher = (author: string): ForumService => ({
        execute: (command, operationId) => Effect.tryPromise((signal) =>
          forumThread.request(
            { author, operationId, command },
            { key: JSON.stringify(["forum", author, operationId]), signal }
          )
        ).pipe(Effect.orDie)
      })
      const artifactHost = await createBunHost({
        actor: createArtifactActor(),
        ...(logs?.host("artifacts") ?? { storage: ":memory:" }),
        driver: { maxConcurrentThreads: 1 },
        layersFor: () => artifactWorkspaceLayer(artifacts)
      })
      provisionalHosts.push(artifactHost)
      const libraryHost = await createBunHost({
        actor: createLibraryActor(),
        ...(logs?.host("library") ?? { storage: ":memory:" }),
        driver: { maxConcurrentThreads: 1 },
        layersFor: () => libraryCollectionLayer(library)
      })
      provisionalHosts.push(libraryHost)
      const artifactThread = await artifactHost.allocateRootThread({ instance: id, name: "workspace" })
      const libraryThread = await libraryHost.allocateRootThread({ instance: id, name: "library" })
      const artifactDispatcher: ArtifactActorDispatcher = {
        policy: artifacts.policy,
        request: (request, invocationId) =>
          Effect.tryPromise((signal) =>
            artifactThread.request(request, {
              key: JSON.stringify([request.author, invocationId]),
              signal
            })
          ).pipe(Effect.orDie)
      }
      const libraryDispatcher = (author: string): LibraryActorDispatcher => ({
        policy: library.policy,
        request: (request, operationId) =>
          Effect.tryPromise((signal) =>
            libraryThread.request(
              { ...request, author, operationId },
              { key: JSON.stringify([author, operationId]), signal }
            )
          ).pipe(Effect.orDie)
      })
      const packages = new TownPackages(options.exa?.apiKey)
      let budgetSession: ForumSession | undefined
      const credentialRuntime = ManagedRuntime.make(sqliteCredentialsLayer(logs ? join(logs.directory, "private", "connections.sqlite") : ":memory:"))
      provisionalHosts.push({ close: () => credentialRuntime.dispose() })
      const credentials = await credentialRuntime.runPromise(CredentialStore)
      if (archive) {
        const saved = await Effect.runPromise(credentials.get(`${id}/exa`))
        if (saved) {
          const value = JSON.parse(Redacted.value(saved)) as { enabled: boolean; apiKey?: string }
          packages.update({ id: "exa", enabled: value.enabled, ...(value.apiKey ? { apiKey: value.apiKey } : { removeKey: true }) })
        }
      }
      const mcp = new McpConnections(() => budgetSession?.budgetChanged(), async event => {
        const runtime = await hostBackend(host).ensure(id)
        for (const resident of residents) await runtime.commitRoot(runtime.self(resident.id), { ...event })
        runtime.schedule()
      }, { townId: id, credentials, record: connections => logs?.event("ConnectionsChanged", connections) })
      provisionalHosts.push(mcp)
      const pendingConnections = new Map<string, () => Promise<void>>()
      const connectionsHost = await createBunHost({
        actor: createConnectionsActor(),
        ...(logs?.host("connections") ?? { storage: ":memory:" }),
        driver: { maxConcurrentThreads: 1 },
        layersFor: () => connectionsLayer((requestId, action) => Effect.tryPromise({
          try: async () => { const task = pendingConnections.get(requestId); if (!task) throw Error("Connection request expired."); await task(); return action === "call-tool" ? undefined : mcp.savedConfiguration() },
          catch: () => new Error("Connection request failed.")
        }))
      })
      provisionalHosts.push(connectionsHost)
      const connectionsThread = await connectionsHost.allocateRootThread({ instance: id, name: "connections" })
      let connectionQueue: Promise<unknown> = Promise.resolve()
      const connectionRequest = <T>(action: string, task: () => Promise<T>): Promise<T> => {
        const job = connectionQueue.then(async () => {
          const requestId = crypto.randomUUID()
          let result: T | undefined
          let failure: unknown
          pendingConnections.set(requestId, async () => { try { result = await task() } catch (error) { failure = error; throw error } })
          try {
            const response = await connectionsThread.request({ requestId, action }, { key: requestId })
            if (!response.ok) throw failure ?? new Error("Connection request failed.")
            return result as T
          } finally { pendingConnections.delete(requestId) }
        })
        connectionQueue = job.catch(() => {})
        return job
      }
      const savedInbox = archive?.actorEvents("human", "human").filter(event => event.type === "human-inboxCompleted").at(-1)?.output as HumanResult | undefined
      const inbox = new HumanInbox(savedInbox?.items)
      const inboxHost = await createBunHost({ actor: createHumanInboxActor(), ...(logs?.host("human") ?? { storage: ":memory:" }), driver: { maxConcurrentThreads: 1 }, layersFor: () => inboxLayer(inbox) })
      provisionalHosts.push(inboxHost)
      const inboxThread = await inboxHost.allocateRootThread({ instance: id, name: "human" })
      const changeInbox = async (command: HumanCommand, key: string) => {
        const result = await inboxThread.request(command, { key }) as HumanResult
        budgetSession?.budgetChanged()
        return result
      }
      const notifyInbox = () => {
        const pending = inbox.snapshot().filter(item => item.status === "pending")
        budgetSession?.setHumanWaiting(pending.map(item => item.author))
      }
      const resolveInbox = async (item: HumanRequest, answer: string) => {
        const result = await changeInbox({ kind: "resolve", id: item.id, answer }, `resolve:${item.id}`)
        notifyInbox()
        const owner = missions.list().find(mission => !mission.parentMissionId)?.owner
        for (const resident of new Set([item.author, ...(owner ? [owner] : [])])) budgetSession?.notifyHuman(resident, `Human inbox request ${item.id} resolved. Read read_human_inbox for the answer and continue the mission.`)
        return result
      }
      const reconcileInbox = async () => {
        for (const item of inbox.snapshot()) {
          const preset = MCP_PRESETS.find(preset => preset.name === item.provider)
          if (item.status === "pending" && item.kind === "package" && preset && mcp.snapshot().some(connection => connection.url === preset.url && connection.status === "connected")) await resolveInbox(item, `${preset.label} connected. Its tools are available.`)
        }
      }
      const installPreset = async (provider: string, callback: string) => {
        const preset = MCP_PRESETS.find(preset => preset.name === provider)
        if (!preset) throw Error("Unknown official package.")
        const existing = mcp.snapshot().find(connection => connection.url === preset.url)
        if (existing?.status === "connected") return { connections: mcp.snapshot() }
        return connectionRequest(existing ? "connect" : "add", () => mcp.command(existing ? { action: "connect", id: existing.id } : { action: "add", name: preset.name, url: preset.url, auth: preset.auth }, callback))
      }
      const requestHuman = async (author: string, kind: "question" | "package" | "list", input: unknown, operationId: string) => {
        if (kind === "list") return { items: inbox.snapshot() }
        const root = missions.list().find(mission => !mission.parentMissionId)
        if (!root || root.owner !== author || root.status !== "claimed" || (root.claimExpiresAt !== undefined && root.claimExpiresAt <= Date.now())) return { ok: false, error: "Only the current main mission owner can request human help. Coordinate with the owner through the forum." }
        const args = input as { [key: string]: unknown } | null
        const question = kind === "question" ? args?.question : args?.reason
        if (typeof question !== "string" || !question.trim() || question.length > 2000) return { ok: false, error: "Supply a question or reason up to 2000 characters." }
        const choices = args?.options ?? []
        if (!Array.isArray(choices) || choices.length > 5 || choices.some(choice => typeof choice !== "string" || !choice.trim() || choice.length > 200)) return { ok: false, error: "Supply up to five short answer options." }
        const preset = MCP_PRESETS.find(preset => preset.name === args?.provider)
        if (kind === "package" && !preset) return { ok: false, error: "Choose an official package from the tool schema." }
        const request: HumanRequest = { id: JSON.stringify([author, operationId]), author, kind, question: question.trim(), options: choices as string[], at: Date.now(), status: "pending", ...(preset ? { provider: preset.name } : {}) }
        const result = await changeInbox({ kind: "create", request }, request.id)
        if (result.ok && preset?.auth === "none") await installPreset(preset.name, "")
        await reconcileInbox()
        notifyInbox()
        return { ...result, request: inbox.snapshot().find(item => item.id === result.request?.id), instruction: "If pending, finish your turn. You will be notified when the user responds." }
      }
      const budget = new TownBudget(input.budgetUsd ?? 1, () => budgetSession?.budgetChanged())
      const definition = createResearchActor(
        input.maxToolCalls,
        options.exa?.policy,
        options.workspacePolicy
      )
      if (archive && logs && generation) for (const resident of residents) archive.copyResidentWorkspace(resident.id, join(logs.directory, "runtime", generation, `resident-${encodeURIComponent(resident.id)}.sqlite`))
      const host = await createBunHost({
        actor: definition,
        ...(logs?.host("resident") ?? { storage: ":memory:" }),
        driver: { maxConcurrentThreads: input.maxConcurrent },
        layersFor: (thread) =>
          Layer.mergeAll(
            FetchHttpClient.layer,
            humanLayer({ request: (kind, input, operationId) => requestHuman(thread, kind, input, operationId) }),
            modelServices.layers,
            mcpLayer({ call: (connection, tool, args, signal) => connectionRequest("call-tool", () => { signal.throwIfAborted(); return mcp.call(connection, tool, args, signal) }) }),
            forumLayer(forumDispatcher(thread)),
            artifactLayer(artifactDispatcher, thread),
            missionLayer(missions, (command, operationId) => Effect.tryPromise((signal) =>
              forumThread.mission(
                { author: thread, operationId, command },
                { key: JSON.stringify(["mission", thread, operationId]), signal }
              )
            ).pipe(Effect.orDie)),
            libraryLayer(libraryDispatcher(thread), thread),
            exaLayer({ ...options.exa, connection: packages.exa })
          )
      })
      provisionalHosts.push(host)
      try {
        const threads = new Map(
          await Promise.all(
            residents.map(
              async (resident) =>
                [
                  resident.id,
                  await host.allocateRootThread({
                    instance: id,
                    name: resident.id
                  })
                ] as const
            )
          )
        )
        if (archive && restored) {
          const runtime = await hostBackend(host).ensure(id)
          for (const resident of residents) {
            const events = archive.actorEvents("resident", resident.id, true)
            const terminal = new Set(events.filter(event => ["TurnCompleted", "TurnFailed", "TurnCancelled"].includes(event.type)).map(event => `${event.turn}:${event.epoch ?? 0}`))
            const cancelled = events.filter(event => event.type === "MessageReceived" && !terminal.has(`${event.id}:0`)).map(event => ({ type: "TurnCancelled", turn: String(event.id), request: crypto.randomUUID(), cause: "requested", reason: "Town restored after shutdown.", at: Date.now() }))
            const oldPackages = new Map<string, string>()
            for (const event of events) {
              if (event.type === "PackageInstalled" || event.type === "PackageUpdated") oldPackages.set(String(event.name), String(event.connectionId))
              if (event.type === "PackageRemoved") oldPackages.delete(String(event.name))
            }
            const disconnected = [...oldPackages].map(([name, connectionId]) => ({ type: "PackageRemoved", id: crypto.randomUUID(), name, connectionId, at: Date.now() }))
            // A newly allocated thread already owns its initial ThreadCreated event.
            await runtime.seed(resident.id, [...events.filter(event => event.type !== "ThreadCreated"), ...cancelled, ...disconnected])
            const usage = usageIn(events)
            const usd = usage.reportedCostUsd ?? usage.estimatedCostUsd
            const called = events.some(event => event.type === "ModelCalled")
            budget.settle(resident.id, { usd: usd ?? 0, estimated: usage.reportedCostUsd === undefined && usd !== undefined, unavailable: called && usd === undefined })
          }
          budget.restoreHistory(restored.session?.spend?.limitUsd ?? input.budgetUsd ?? 1, restored.grants)
        }
        const session = new ForumSession(
          board,
          residents,
          {
            wake: async (resident, notification, roster, signal, allowance) => {
              const budgetUsd = allowance!
              try { return await threads.get(resident.id)!.message(
                {
                  input: { budgetUsd },
                  text: `You are ${resident.name} (${resident.id}). Town: ${config.name}. Mission: ${config.premise}\nResidents: ${roster.map((member) => `${member.name} (${member.id})`).join(", ")}\nAim for ${config.postWords} words or fewer per post.\n${notification}\nUse read_board to inspect the forum. You may acknowledge and stay silent.`
                },
                {
                  key: crypto.randomUUID(),
                  timeoutMs: config.timeoutMs,
                  signal
                }
              ) } catch (error) {
                if (String(error).includes("TOWN_SPEND_ALLOWANCE_EXHAUSTED")) return "TOWN_SPEND_ALLOWANCE_EXHAUSTED"
                throw error
              } finally {
                try {
                  const runtime = await hostBackend(host).ensure(id)
                  const events = await runtime.read(resident.id)
                  const usage = usageIn(events)
                  const usd = usage.reportedCostUsd ?? usage.estimatedCostUsd
                  budget.settle(resident.id, { usd: usd ?? 0, estimated: usage.reportedCostUsd === undefined && usd !== undefined, unavailable: usd === undefined })
                } catch {
                  budget.settle(resident.id, { usd: 0, estimated: false, unavailable: true })
                }
              }
            },
            close: async () => {
              await Promise.allSettled([
                mcp.close(),
                connectionsHost.close(),
                inboxHost.close(),
                host.close(),
                artifactHost.close(),
                libraryHost.close(),
                forumHost.close()
              ])
              await credentialRuntime.dispose()
            }
          },
          input.maxTurns,
          missions,
          { maxConcurrent: input.maxConcurrent, budget }
        )
        if (restored?.session) session.restoreState(restored.session)
        budgetSession = session
        const current = session
        let expiryTimer: ReturnType<typeof setTimeout> | undefined
        const scheduleExpiry = () => {
          if (expiryTimer !== undefined) clearTimeout(expiryTimer)
          const deadline = missions.nextExpiry()
          expiryTimer =
            deadline === undefined
              ? undefined
              : setTimeout(
                  () => missions.expire(),
                  Math.max(0, deadline - Date.now())
                )
        }
        const stopExpirySchedule = missions.subscribe(scheduleExpiry)
        scheduleExpiry()
        const stopLogs = logs ? [
          board.subscribe(event => logs.event(event.type, event)),
          missions.subscribe(() => logs.event("MissionsChanged", missions.list())),
          current.subscribe(() => logs.event("SessionChanged", current.snapshot()))
        ] : []
        if (!archive) logs?.event("TownCreated", { messages: board.snapshot(), missions: missions.list() })
        const closeMissionRuntime = () => {
          stopLogs.forEach(stop => stop())
          logs?.event("TownClosed", current.snapshot())
          stopExpirySchedule()
          if (expiryTimer !== undefined) clearTimeout(expiryTimer)
        }
        const record: Record = {
          inboxAction: async (input, callback) => {
            const value = input as { id?: unknown; action?: unknown; answer?: unknown }
            if (!value || typeof value.id !== "string") throw Error("Invalid inbox request.")
            const item = inbox.snapshot().find(item => item.id === value.id)
            if (!item) throw Error("Request not found.")
            if (item.status === "resolved") return { ok: true, items: inbox.snapshot() }
            if (value.action === "connect" && item.kind === "package" && item.provider) {
              const result = await installPreset(item.provider, callback)
              await reconcileInbox()
              return { ...result, items: inbox.snapshot() }
            }
            if (value.action !== "answer" || typeof value.answer !== "string" || !value.answer.trim() || value.answer.length > 4000) throw Error("Supply an answer up to 4000 characters.")
            return resolveInbox(item, value.answer.trim())
          },
          mcp,
          connectionCommand: async (command, callback) => { const result = await connectionRequest(command.action, () => mcp.command(command, callback)); await reconcileInbox(); return result },
          connectionCallback: async params => { const result = await connectionRequest("oauth-callback", () => mcp.callback(params)); await reconcileInbox(); return result },
          logEvent: (type, data) => logs?.event(type, data),
          updatePackage: update => connectionRequest("configure-exa", async () => {
            packages.update(update)
            await Effect.runPromise(credentials.set(`${id}/exa`, Redacted.make(JSON.stringify(packages.exa()))))
            current.budgetChanged()
          }),
          readEvents: async (resident, cursor) => {
            const runtime = await hostBackend(host).ensure(id)
            const rows = await runtime.readPage(resident, cursor, 51)
            const page = rows.slice(0, 50)
            return { events: page.map(row => JSON.parse(mcp.redact(JSON.stringify(residentEvent(row, packages.exa().apiKey))))), cursor: page.at(-1)?.seq ?? cursor, hasMore: rows.length > 50 }
          },
          packages,
          budget,
          token,
          board,
          artifacts,
          missions,
          library,
          post: (command, operationId) => forumThread.post(
            { command, operationId },
            { key: JSON.stringify(["user-post", operationId]) }
          ),
          review: (command, operationId) => forumThread.mission(
            { author: "user", operationId, command },
            { key: JSON.stringify(["mission", "user", operationId]) }
          ),
          readArtifact: async (path, revision) => {
            const operationId = crypto.randomUUID()
            const response = await Effect.runPromise(artifactDispatcher.request(
              { kind: "read", author: "user", operationId, path, ...(revision === undefined ? {} : { revision }) },
              operationId
            ))
            return response.kind === "read" && response.artifact
              ? { artifact: response.artifact, history: response.history }
              : undefined
          },
          uploadLibrary: (title, content, operationId) => Effect.runPromise(libraryDispatcher("user").request({ kind: "add", title, content, sourceUrl: null }, operationId)),
          readLibrary: async (entryId) => {
            const operationId = crypto.randomUUID()
            const response = await Effect.runPromise(
              libraryDispatcher("user").request({ kind: "read", id: entryId }, operationId)
            )
            return response.kind === "read" ? response.document : undefined
          },
          closeMissionRuntime,
          session: current,
          viewers: new Set(),
          snapshot: () => ({
            id,
            config,
            residents,
            palettes,
            messages: board.snapshot(),
            karma: board.karma(residents.map(({ id }) => id)),
            artifacts: artifacts.list(),
            missions: missions.list(),
            library: library.list(),
            policy: board.policy,
            state: current.snapshot(),
            mcp: mcp.snapshot(),
            inbox: inbox.snapshot(),
            packages: packages.snapshot(),
            model: modelServices.model,
            maxConcurrent: input.maxConcurrent,
            maxTurns: input.maxTurns
          })
        }
        if (closed) {
          closeMissionRuntime()
          await current.close()
          throw new Error("Town server is closing.")
        }
        towns.set(id, record)
        established = true
        if (archive) {
          logs?.event("TownRestored", { generation })
          // Reconnection loads credentials but never invokes resident tools or model calls.
          await connectionRequest("restore", () => mcp.restore(restored?.connections ?? []))
        } else {
          // Install search before residents start so their first turn can use it.
          await connectionRequest("add", () => mcp.command({
            action: "add", name: "Exa", url: "https://mcp.exa.ai/mcp", auth: "none"
          }, ""))
          current.resume()
        }
        notifyInbox()
        await reconcileInbox()
        if (archive) for (const item of inbox.snapshot().filter(item => item.status === "resolved")) current.notifyHuman(item.author, "The human inbox has saved responses. Read read_human_inbox before continuing.")
        return { id, token, snapshot: record.snapshot() }
      } catch (error) {
        await Promise.allSettled([host.close(), artifactHost.close(), libraryHost.close(), forumHost.close()])
        throw error
      }
    } finally {
      if (!established)
        await Promise.allSettled(provisionalHosts.map((host) => host.close()))
      creating--
    }
  }
  const opening = new Map<string, Promise<{ id: string; token: string; snapshot: TownSnapshot }>>()
  const deleting = new Set<string>()
  const open = (id: string) => {
    if (deleting.has(id)) return Promise.reject(new Error("Town is being deleted."))
    const current = towns.get(id)
    if (current) return Promise.resolve({ id, token: current.token, snapshot: current.snapshot() })
    const existing = opening.get(id)
    if (existing) return existing
    if (!options.dataDirectory) return Promise.reject(new Error("Saved towns are unavailable."))
    const archive = new TownArchive(options.dataDirectory, id)
    const job = create(archive.metadata, archive).finally(() => opening.delete(id))
    opening.set(id, job)
    return job
  }
  const fetch = async (request: Request): Promise<Response> => {
    const url = new URL(request.url)
    const origin = request.headers.get("origin")
    if ((origin && origin !== url.origin) || (request.headers.get("sec-fetch-site") === "cross-site" && !(request.method === "GET" && url.pathname === "/api/mcp/callback")))
      return json({ error: "Cross-origin requests are not allowed." }, 403)
    try {
      if (url.pathname === "/api/towns" && request.method === "GET") {
        const summaries = new Map((options.dataDirectory ? savedTowns(options.dataDirectory) : []).map(town => [town.id, town]))
        for (const [id, record] of towns) {
          const snapshot = record.snapshot(), previous = summaries.get(id)
          summaries.set(id, { id, name: snapshot.config.name, premise: snapshot.config.premise, residents: snapshot.residents.length, createdAt: previous?.createdAt ?? Date.now(), updatedAt: previous?.updatedAt ?? Date.now(), running: snapshot.state.running })
        }
        return json([...summaries.values()].sort((a, b) => b.updatedAt - a.updatedAt))
      }
      const deletion = /^\/api\/towns\/([a-zA-Z0-9-]+)$/.exec(url.pathname)
      if (deletion && request.method === "DELETE") {
        const id = deletion[1]!
        if (opening.has(id) || deleting.has(id)) return json({ error: "Town is busy. Try again." }, 409)
        const record = towns.get(id)
        if (record?.session.snapshot().running) return json({ error: "Pause this town before deleting it." }, 409)
        const saved = options.dataDirectory && savedTowns(options.dataDirectory).some(town => town.id === id)
        if (!record && !saved) return json({ error: "Town not found." }, 404)
        deleting.add(id)
        try {
          if (record) { record.closeMissionRuntime(); await record.session.close(); towns.delete(id) }
          if (options.dataDirectory) rmSync(join(options.dataDirectory, "towns", id), { recursive: true, force: true })
          if (options.artifactDirectory) rmSync(join(options.artifactDirectory, id), { recursive: true, force: true })
          return json({ ok: true })
        } finally { deleting.delete(id) }
      }
      const reopen = /^\/api\/towns\/([a-zA-Z0-9-]+)\/open$/.exec(url.pathname)
      if (reopen && request.method === "POST") {
        const id = reopen[1]!
        if (!towns.has(id) && !options.dataDirectory) return json({ error: "Saved towns are unavailable." }, 404)
        if (!towns.has(id) && !savedTowns(options.dataDirectory!).some(town => town.id === id))
          return json({ error: "Town not found." }, 404)
        return json(await open(id))
      }
      if (url.pathname === "/api/mcp/callback" && request.method === "GET") {
        const state = url.searchParams.get("state")
        const record = state && [...towns.values()].find(record => record.mcp.ownsState(state))
        if (!record) return new Response("Authorization expired or invalid. Return to Packages and connect again.", { status: 400 })
        await record.connectionCallback(url.searchParams)
        return new Response("Connected. You can close this tab and return to Packages. All discovered tools are enabled by default.", { headers: { "Content-Type": "text/plain", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } })
      }
      if ((url.pathname === "/api/town-config" || url.pathname === "/api/colony-config") && request.method === "GET")
        return json({ ...info, model: options.modelServices?.().model ?? info.model })
      if ((url.pathname === "/api/towns" || url.pathname === "/api/colonies") && request.method === "POST")
        return json(
          await create((await request.json()) as ServerTownOptions),
          201
        )
      const match =
        /^\/api\/(?:towns|colonies)\/([^/]+)(?:\/(actors|inbox|history|events|pause|resume|budget|packages|mcp|resident-events|post|artifact|library|workspace|review|stop))?$/.exec(
          url.pathname
        )
      if (!match) return json({ error: "Not found" }, 404)
      const record = towns.get(match[1]!)
      if (
        !record ||
        request.headers.get("authorization") !== `Bearer ${record.token}`
      )
        return json({ error: "Town not found or access expired." }, 404)
      if (match[2] === "actors" && request.method === "GET") return json(record.snapshot().residents)
      if (match[2] === "inbox" && request.method === "POST") {
        try { return json(await record.inboxAction(await request.json(), `${url.origin}/api/mcp/callback`)) }
        catch (error) { return json({ error: error instanceof Error ? error.message : "Inbox action failed." }, 400) }
      }
      if (match[2] === "mcp" && request.method === "POST") {
        return json(await record.connectionCommand(await request.json() as McpCommand, `${url.origin}/api/mcp/callback`))
      }
      if (match[2] === "resident-events" && request.method === "GET") {
        const resident = url.searchParams.get("resident") ?? ""
        const cursor = Number(url.searchParams.get("cursor") ?? 0)
        if (!record.snapshot().residents.some(entry => entry.id === resident)) return json({ error: "Resident not found." }, 404)
        if (!Number.isSafeInteger(cursor) || cursor < 0) return json({ error: "Invalid event cursor." }, 400)
        return json(await record.readEvents(resident, cursor))
      }
      if (match[2] === "packages" && request.method === "POST") {
        await record.updatePackage(await request.json() as PackageUpdate)
        return json(record.snapshot())
      }
      if (match[2] === "workspace" && request.method === "GET") {
        const missionId = url.searchParams.get("missionId") ?? ""
        if (!record.missions.list().some(mission => mission.id === missionId)) return json({ error: "Mission not found." }, 404)
        const path = url.searchParams.get("path")
        if (path === null) return json(record.missions.workspace.list(missionId))
        const file = record.missions.workspace.read(missionId, path)
        return file ? json(file) : json({ error: "File not found." }, 404)
      }
      if (match[2] === "review" && request.method === "POST") {
        const input = await request.json() as { missionId?: unknown; reviewId?: unknown; decision?: unknown; reason?: unknown; operationId?: unknown }
        if (typeof input.missionId !== "string" || typeof input.reviewId !== "string" || typeof input.reason !== "string" || !input.reason.trim() || typeof input.operationId !== "string" || !input.operationId || (input.decision !== "complete" && input.decision !== "needs_work")) return json({ error: "Invalid review." }, 400)
        return json(await record.review({ type: "vote_mission_completion", missionId: input.missionId, reviewId: input.reviewId, decision: input.decision, reason: input.reason }, input.operationId))
      }
      if (match[2] === "artifact" && request.method === "GET") {
        const path = url.searchParams.get("path") ?? ""
        const revision = url.searchParams.has("revision") ? Number(url.searchParams.get("revision")) : undefined
        const artifact = await record.readArtifact(path, revision)
        return artifact ? json(artifact) : json({ error: "Artifact not found." }, 404)
      }
      if (match[2] === "history" && request.method === "GET") {
        if (!options.dataDirectory) return json({ error: "History requires local logs." }, 404)
        const full = new TownArchive(options.dataDirectory, match[1]!)
        const start = full.metadata.createdAt, end = Date.now()
        if (!url.searchParams.has("at")) return json({ start, end })
        const requested = Number(url.searchParams.get("at"))
        if (!Number.isFinite(requested)) return json({ error: "Invalid history time." }, 400)
        const at = Math.max(start, Math.min(end, requested))
        const past = new TownArchive(options.dataDirectory, match[1]!, at).rebuild()
        const live = record.snapshot()
        const historicalBoard = new MemoryForum(live.policy)
        historicalBoard.restoreHistory(past.messages, past.votes)
        historicalBoard.registerMissionResolver(id => past.missions.find(mission => mission.id === id))
        const historicalArtifacts = new ArtifactStore()
        historicalArtifacts.restoreHistory(past.artifacts)
        return json({ start, end, at, snapshot: { ...live,
          messages: historicalBoard.snapshot(), karma: historicalBoard.karma(live.residents.map(resident => resident.id)),
          missions: past.missions, artifacts: historicalArtifacts.list(),
          inbox: ((new TownArchive(options.dataDirectory, match[1]!, at).actorEvents("human", "human").filter(event => event.type === "human-inboxCompleted").at(-1)?.output as HumanResult | undefined)?.items ?? []).filter(item => item.at <= at), library: past.library.map(({ content, ...entry }) => entry), mcp: past.connections.map(connection => connection.info),
          state: { ...(past.session ?? live.state), running: false, thinking: [], pending: 0 }
        }, documents: past.artifacts, references: past.library, files: Object.fromEntries([...past.workspace].map(([id, files]) => [id, [...files.values()]])) })
      }
      if (match[2] === "library" && request.method === "POST") {
        const input = await request.json() as { title?: unknown; content?: unknown; operationId?: unknown }
        if (typeof input.title !== "string" || !/\.(md|markdown)$/i.test(input.title) || typeof input.content !== "string" || typeof input.operationId !== "string" || !input.operationId || input.operationId.length > 200) return json({ error: "Upload a Markdown file." }, 400)
        if (input.content.length > record.library.policy.maxContentCharacters) return json({ error: "Markdown file exceeds the library size limit." }, 413)
        const result = await record.uploadLibrary(input.title, input.content, input.operationId) as { ok: boolean; error?: string }
        return json(result, result.ok ? 200 : 400)
      }
      if (match[2] === "library" && request.method === "GET") {
        const entry = await record.readLibrary(url.searchParams.get("id") ?? "")
        return entry ? json(entry) : json({ error: "Library entry not found." }, 404)
      }
      if (!match[2] && request.method === "GET") return json(record.snapshot())
      if (((!match[2] && url.pathname.startsWith("/api/colonies/")) || match[2] === "stop") && request.method === "DELETE") {
        towns.delete(match[1]!)
        record.closeMissionRuntime()
        await record.session.close()
        record.viewers.forEach((stop) => stop())
        return json({ stopped: true })
      }
      if (match[2] === "events" && request.method === "GET") {
        let stop = () => {}
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            const encoder = new TextEncoder()
            let ended = false
            const send = () => {
              if (!ended)
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify(record.snapshot())}\n\n`
                  )
                )
            }
            const offBoard = record.board.subscribeChanges(send),
              offSession = record.session.subscribe(send),
              offArtifacts = record.artifacts.subscribe(send),
              offMissions = record.missions.subscribe(send),
              offLibrary = record.library.subscribe(send)
            const heartbeat = setInterval(() => {
              if (!ended) controller.enqueue(encoder.encode(": keepalive\n\n"))
            }, heartbeatMs)
            stop = () => {
              if (ended) return
              ended = true
              offBoard()
              offSession()
              offArtifacts()
              offMissions()
              offLibrary()
              clearInterval(heartbeat)
              request.signal.removeEventListener("abort", stop)
              streams.delete(stop)
              record.viewers.delete(stop)
              controller.close()
            }
            streams.add(stop)
            record.viewers.add(stop)
            request.signal.addEventListener("abort", stop, { once: true })
            if (request.signal.aborted) stop()
            else send()
          },
          cancel() {
            stop()
          }
        })
        return new Response(body, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no"
          }
        })
      }
      if (request.method === "POST" && match[2] === "budget") {
        const input = await request.json() as { amountUsd: number; operationId: string }
        record.budget.add(input.amountUsd, input.operationId)
        record.logEvent("BudgetAdded", { amount: input.amountUsd, operationId: input.operationId })
        return json(record.snapshot())
      }
      if (request.method === "POST" && match[2] === "pause") {
        record.session.pause()
        return json(record.snapshot())
      }
      if (request.method === "POST" && match[2] === "resume") {
        const state = record.session.snapshot()
        if (!state.running)
          record.session.resume()
        return json(record.snapshot())
      }
      if (request.method === "POST" && match[2] === "post") {
        const input = (await request.json()) as {
          command?: { kind?: unknown }
          operationId?: unknown
        }
        const { kind, ...args } = input.command ?? {}
        const command =
          kind === "create_post" || kind === "reply"
            ? decodeForumCommand(kind, args)
            : undefined
        if (
          !command ||
          (command.kind !== "create_post" && command.kind !== "reply") ||
          typeof input.operationId !== "string" ||
          !input.operationId
        )
          return json({ error: "Invalid forum post" }, 400)
        return json(
          await record.post(command, input.operationId)
        )
      }
      return json({ error: "Method not allowed" }, 405)
    } catch (error) {
      return json(
        { error: error instanceof Error ? error.message : String(error) },
        400
      )
    }
  }
  return {
    fetch,
    info,
    async close() {
      closed = true
      streams.forEach((stop) => stop())
      towns.forEach((record) => record.closeMissionRuntime())
      await Promise.allSettled(
        [...towns.values()].map((record) => record.session.close())
      )
      towns.clear()
    }
  }
}
