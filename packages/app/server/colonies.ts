import { TownPackages } from "./packages"
import type { PackageUpdate } from "../src/town/packages/types"
import { TownBudget, validBudget } from "../src/town/budget"
import { hostBackend } from "tardie/bun/create-host"
import { usageIn } from "tardie/agent"
import { TownLogs } from "./logs"
import { createForumActor, forumStateLayer } from "../src/town/actors/forum/actor"
import type { UserForumCommand } from "../src/town/actors/forum/user"
import { mkdirSync, writeFileSync, renameSync } from "node:fs"
import { dirname, join } from "node:path"
import { ArtifactStore, type ArtifactPolicy } from "../src/town/actors/artifacts/store"
import { artifactLayer } from "../src/town/actors/resident/components/artifacts"
import { createArtifactActor, artifactWorkspaceLayer, type ArtifactActorDispatcher } from "../src/town/actors/artifacts/actor"
import { MissionStore, DEFAULT_MISSION_POLICY, type MissionPolicy, type MissionResult, type MissionCommand } from "../src/town/actors/forum/missions/store"
import { missionLayer } from "../src/town/actors/resident/components/missions"
import { LibraryStore, DEFAULT_LIBRARY_POLICY, type LibraryPolicy } from "../src/town/actors/library/store"
import { createLibraryActor, libraryCollectionLayer, type LibraryActorDispatcher } from "../src/town/actors/library/actor"
import { libraryLayer } from "../src/town/actors/resident/components/library"
import { Effect, Layer } from "effect"
import type { LanguageModel } from "effect/unstable/ai"
import type { ModelLock } from "tardie/model/lock"
import { createBunHost } from "tardie/bun"
import { createResearchActor } from "../src/town/actors/resident/actor"
import { exaLayer, type ExaOptions } from "../src/town/actors/resident/components/code/exa"
import type { WorkspacePolicy } from "tardie/code"
import { MemoryForum } from "../src/town/actors/forum/store"
import { ForumSession } from "../src/town/actors/forum/session"
import { makeResidents, DEFAULT_MAX_AGENTS } from "../src/town/world"
import { shuffleDuckPalettes } from "../src/town/scene/duckPalettes"
import { createMissionForum } from "../src/town/actors/forum/user"
import { decodeForumCommand, forumLayer, type ForumService, type ForumResult } from "../src/town/actors/resident/components/forum"
import {
  DEFAULT_SERVER_MAX_COLONIES,
  DEFAULT_SERVER_MAX_TURNS,
  DEFAULT_SERVER_MAX_TOOL_CALLS,
  DEFAULT_SERVER_MAX_TIMEOUT_MS,
  DEFAULT_SERVER_TURN_TIMEOUT_MS,
  DEFAULT_SERVER_HEARTBEAT_MS,
  type ColonySnapshot,
  type ColonyServerInfo,
  type ServerColonyOptions
} from "../src/town/protocol"

export interface ColonyServerOptions {
  dataDirectory?: string
  artifactDirectory?: string
  artifactPolicy?: Partial<ArtifactPolicy>
  missionPolicy?: Partial<MissionPolicy>
  libraryPolicy?: Partial<LibraryPolicy>
  exa?: ExaOptions
  workspacePolicy?: Partial<WorkspacePolicy>

  layers: Layer.Layer<LanguageModel.LanguageModel | ModelLock>
  model: string
  maxAgents?: number | undefined
  maxColonies?: number | undefined
  maxTurns?: number | undefined
  maxToolCalls?: number | undefined
  maxTimeoutMs?: number | undefined
  defaultTimeoutMs?: number | undefined
  heartbeatMs?: number | undefined
}

export function createColonyService(options: ColonyServerOptions) {
  const info: ColonyServerInfo = {
    model: options.model,
    maxAgents: options.maxAgents ?? DEFAULT_MAX_AGENTS,
    maxColonies: options.maxColonies ?? DEFAULT_SERVER_MAX_COLONIES,
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
    throw new Error("Invalid colony server limits.")
  type Record = {
    token: string
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
    readLibrary: (id: string) => Promise<unknown>
    closeMissionRuntime: () => void
    snapshot: () => ColonySnapshot
    viewers: Set<() => void>
  }
  const colonies = new Map<string, Record>()
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
  const create = async (input: ServerColonyOptions) => {
    if (closed) throw new Error("Colony server is closing.")
    if (colonies.size + creating >= info.maxColonies)
      throw new Error(
        `Server limit reached: ${info.maxColonies} colonies. Stop an existing colony first.`
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
        "Invalid colony settings. Check the server's published limits."
      )
    creating++
    const provisionalHosts: { close: () => Promise<void> }[] = []
    let established = false
    try {
      const id = crypto.randomUUID()
      const token = crypto.randomUUID()
      const config = { ...input.config }
      const residents = makeResidents(config.count, info.maxAgents)
      const logs = options.dataDirectory ? new TownLogs(options.dataDirectory, id, {
        id, createdAt: Date.now(), config, residents, model: info.model,
        maxConcurrent: input.maxConcurrent, maxTurns: input.maxTurns, maxToolCalls: input.maxToolCalls, budgetUsd: input.budgetUsd ?? 1
      }) : undefined
      const palettes = shuffleDuckPalettes()
      const board = createMissionForum(config.premise)
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
      const budget = new TownBudget(input.budgetUsd ?? 1, () => budgetSession?.budgetChanged())
      const definition = createResearchActor(
        input.maxToolCalls,
        options.exa?.policy,
        options.workspacePolicy
      )
      const host = await createBunHost({
        actor: definition,
        ...(logs?.host("resident") ?? { storage: ":memory:" }),
        driver: { maxConcurrentThreads: input.maxConcurrent },
        layersFor: (thread) =>
          Layer.mergeAll(
            options.layers,
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
        const session = new ForumSession(
          board,
          residents,
          {
            wake: async (resident, notification, roster, signal, allowance) => {
              const budgetUsd = allowance!
              try { return await threads.get(resident.id)!.message(
                {
                  input: { budgetUsd },
                  text: `You are ${resident.name} (${resident.id}). Colony: ${config.name}. Mission: ${config.premise}\nResidents: ${roster.map((member) => `${member.name} (${member.id})`).join(", ")}\nAim for ${config.postWords} words or fewer per post.\n${notification}\nUse read_board to inspect the forum. You may acknowledge and stay silent.`
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
                host.close(),
                artifactHost.close(),
                libraryHost.close(),
                forumHost.close()
              ])
            }
          },
          input.maxTurns,
          missions,
          { maxConcurrent: input.maxConcurrent, budget }
        )
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
        logs?.event("TownCreated", { messages: board.snapshot(), missions: missions.list() })
        const closeMissionRuntime = () => {
          stopLogs.forEach(stop => stop())
          logs?.event("TownClosed", current.snapshot())
          stopExpirySchedule()
          if (expiryTimer !== undefined) clearTimeout(expiryTimer)
        }
        const record: Record = {
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
            packages: packages.snapshot(),
            model: info.model,
            maxConcurrent: input.maxConcurrent,
            maxTurns: input.maxTurns
          })
        }
        if (closed) {
          closeMissionRuntime()
          await current.close()
          throw new Error("Colony server is closing.")
        }
        colonies.set(id, record)
        established = true
        current.resume()
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
  const fetch = async (request: Request): Promise<Response> => {
    const url = new URL(request.url)
    const origin = request.headers.get("origin")
    if (origin && origin !== url.origin)
      return json({ error: "Cross-origin requests are not allowed." }, 403)
    try {
      if (url.pathname === "/api/colony-config" && request.method === "GET")
        return json(info)
      if (url.pathname === "/api/colonies" && request.method === "POST")
        return json(
          await create((await request.json()) as ServerColonyOptions),
          201
        )
      const match =
        /^\/api\/colonies\/([^/]+)(?:\/(events|pause|resume|budget|packages|post|artifact|library|workspace|review))?$/.exec(
          url.pathname
        )
      if (!match) return json({ error: "Not found" }, 404)
      const record = colonies.get(match[1]!)
      if (
        !record ||
        request.headers.get("authorization") !== `Bearer ${record.token}`
      )
        return json({ error: "Colony not found or access expired." }, 404)
      if (match[2] === "packages" && request.method === "POST") {
        record.packages.update(await request.json() as PackageUpdate)
        record.session.budgetChanged()
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
      if (match[2] === "library" && request.method === "GET") {
        const entry = await record.readLibrary(url.searchParams.get("id") ?? "")
        return entry ? json(entry) : json({ error: "Library entry not found." }, 404)
      }
      if (!match[2] && request.method === "GET") return json(record.snapshot())
      if (!match[2] && request.method === "DELETE") {
        colonies.delete(match[1]!)
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
      colonies.forEach((record) => record.closeMissionRuntime())
      await Promise.allSettled(
        [...colonies.values()].map((record) => record.session.close())
      )
      colonies.clear()
    }
  }
}
