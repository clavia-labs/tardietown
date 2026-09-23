import { Action, Input, Button, Modal, ModalTitle, ModalActions } from "./ui/controls"
import { Disclosure, DisclosureSummary } from "./ui/Disclosure"
import { ModelSettings, readModelSettings } from "./ModelSettings"
import { TownHome } from "./TownHome"
import { DemoRecording } from "./DemoRecording"
import { reconcileTownSnapshot } from "./snapshot"
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { TownSetup } from "./TownSetup"
import { Town } from "./Town"
import {
  DEFAULT_MAX_AGENTS,
  type WorldConfig
} from "./world"
import { DEFAULT_FORUM_CONCURRENCY } from "../actors/forum/session"
import { DEFAULT_FORUM_TOOL_LIMIT } from "../actors/resident/policy"
import {
  createServerTown,
  openSavedTown,
  serverConnection,
  serverInfo,
  type TownAccess
} from "./connection"
import {
  DEFAULT_SERVER_TURN_TIMEOUT_MS,
  type TownSnapshot,
  type TownServerInfo
} from "./protocol"

const accessKey = (id: string) => `terrarium-server:${id}`
export function TownApp() {
  const [needsProvider, setNeedsProvider] = useState(false)
  const [access, setAccess] = useState<TownAccess | null>(null)
  const [setup, setSetup] = useState(false)
  const [config, setConfig] = useState<WorldConfig | null>(null)
  const [info, setInfo] = useState<TownServerInfo>()
  const [error, setError] = useState<string>()
  const [starting, setStarting] = useState(false)
  const [parallel, setParallel] = useState(DEFAULT_FORUM_CONCURRENCY)
  const [tools, setTools] = useState(DEFAULT_FORUM_TOOL_LIMIT)
  const [budgetUsd, setBudgetUsd] = useState(1)
  const [timeout, setTimeoutSeconds] = useState(
    DEFAULT_SERVER_TURN_TIMEOUT_MS / 1000
  )
  useEffect(() => {
    void readModelSettings().then(value => setNeedsProvider(!value.configured), () => {})
    void serverInfo().then(
      (value) => {
        setInfo(value)
        setTimeoutSeconds(value.defaultTimeoutMs / 1000)
      },
      () =>
        setError(
          "Town server unavailable. Start it with bun run dev:server."
        )
    )
  }, [])
  const leave = () => {
    setAccess(null)
    setConfig(null)
    setSetup(false)
    const url = new URL(location.href)
    url.searchParams.delete("town")
    history.replaceState(null, "", url)
  }
  const enter = (next: TownAccess) => {
    sessionStorage.setItem(accessKey(next.id), next.token)
    const url = new URL(location.href)
    url.searchParams.set("town", next.id)
    history.replaceState(null, "", url)
    setAccess({ id: next.id, token: next.token })
  }
  const openTown = async (id: string) => {
    if (starting) return
    setStarting(true); setError(undefined)
    try { enter(await openSavedTown(id)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not open town.") }
    finally { setStarting(false) }
  }
  useEffect(() => {
    const id = new URL(location.href).searchParams.get("town")
    if (id) void openTown(id)
  }, [])
  if (new URL(location.href).searchParams.has("record")) return <DemoRecording />
  if (access) return <ServerTown access={access} onLeave={leave} />
  if (!setup) return <TownHome onOpen={id => void openTown(id)} onNew={() => { setError(undefined); setSetup(true) }} busy={starting} error={error} />
  const start = async (event: FormEvent) => {
    event.preventDefault()
    if (!config || !info || starting || needsProvider) return
    setStarting(true)
    setError(undefined)
    try {
      const result = await createServerTown({
        config: { ...config, timeoutMs: timeout * 1000 },
        maxConcurrent: parallel,
        maxToolCalls: tools,
        maxTurns: info.maxTurns,
        budgetUsd
      })
      enter(result)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setStarting(false)
    }
  }
  return (
    <>
      <Action className="server-resume" type="button" onClick={() => { setConfig(null); setSetup(false) }}>← Your towns</Action>
      <TownSetup
        maxAgents={info?.maxAgents ?? DEFAULT_MAX_AGENTS}
        onCreate={(value) => {
          setConfig(value)
        }}
      />
      {config && (
        <Modal open={!!config} onOpenChange={open => { if (!open) setConfig(null) }} busy={starting} className="browser-connect">
            <ModalTitle>Start your town</ModalTitle>
            <p>Your residents keep working when you close this tab.</p>
            <div className="setup-provider"><div><span>{needsProvider ? "Connect a model provider" : "Model"}</span>{!needsProvider && <small>{info?.model?.replace(/^[^/]+\//, "") ?? "Connecting…"}</small>}</div><ModelSettings initialOpen={needsProvider} onSaved={() => { setNeedsProvider(false); void serverInfo().then(setInfo) }} /></div>
            <form
              onSubmit={(event) => {
                void start(event)
              }}
            >
              <label>
                Parallel residents
                <Input
                  type="number"
                  min={1}
                  max={info?.maxAgents}
                  value={parallel}
                  onChange={(event) => setParallel(Number(event.target.value))}
                  required
                />
              </label>
              <label>
                Model budget (USD)
                <Input
                  type="number"
                  min={0.01}
                  max={100}
                  step={0.01}
                  value={budgetUsd}
                  onChange={(event) => setBudgetUsd(Number(event.target.value))}
                  required
                />
              </label>
              <Disclosure className="forum-run-settings">
                <DisclosureSummary>Run settings</DisclosureSummary>
                <label>
                  Tool calls per turn
                  <Input
                    type="number"
                    min={1}
                    max={info?.maxToolCalls}
                    value={tools}
                    onChange={(event) => setTools(Number(event.target.value))}
                    required
                  />
                </label>
                <label>
                  Turn timeout (seconds)
                  <Input
                    type="number"
                    min={1}
                    max={info ? info.maxTimeoutMs / 1000 : undefined}
                    value={timeout}
                    onChange={(event) =>
                      setTimeoutSeconds(Number(event.target.value))
                    }
                    required
                  />
                </label>
              </Disclosure>
              {error && (
                <p role="alert" className="browser-error">
                  {error}
                </p>
              )}
              <ModalActions>
                <Button
                  type="button"
                  onClick={() => setConfig(null)}
                  disabled={starting}
                >
                  Back
                </Button>
                <Button variant="primary" type="submit" disabled={!info || starting || needsProvider}>
                  {starting ? "Starting…" : "Start town"}
                </Button>
              </ModalActions>
            </form>
        </Modal>
      )}
    </>
  )
}
function ServerTown({
  access,
  onLeave
}: {
  access: TownAccess
  onLeave: () => void
}) {
  const connection = useMemo(() => serverConnection(access), [access])
  const [liveSnapshot, setSnapshot] = useState<TownSnapshot>()
  const [history, setHistory] = useState<import("./protocol").TownHistory>()
  const [range, setRange] = useState<{ start: number; end: number }>()
  const [selectedTime, setSelectedTime] = useState<number>()
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string>()
  const historyRequest = useRef(0)
  useEffect(() => { let alive = true; void connection.historyRange().then(value => { if (alive) setRange(value) }, () => {}); return () => { alive = false } }, [connection])
  useEffect(() => {
    const request = ++historyRequest.current
    if (selectedTime === undefined) { setHistory(undefined); setHistoryLoading(false); setHistoryError(undefined); return }
    setHistoryLoading(true)
    const timer = setTimeout(() => { void connection.history(selectedTime).then(value => {
      if (request === historyRequest.current) { setHistory(value); setHistoryLoading(false); setHistoryError(undefined) }
    }, () => { if (request === historyRequest.current) { setHistoryLoading(false); setHistoryError("Could not load this moment.") } }) }, 150)
    return () => { clearTimeout(timer); historyRequest.current++ }
  }, [selectedTime, connection])
  const snapshot = history?.snapshot ?? liveSnapshot
  const historical = selectedTime !== undefined
  const readOnly = async (): Promise<never> => { throw new Error("Return to live to make changes.") }

  const receiveSnapshot = useCallback((next: TownSnapshot) => setSnapshot((previous) => reconcileTownSnapshot(previous, next)), [])
  const [error, setError] = useState<string>()
  const [reconnect, setReconnect] = useState(0)
  useEffect(() => {
    const abort = new AbortController()
    setError(undefined)
    void connection.watch(receiveSnapshot, abort.signal).catch((cause) => {
      if (!abort.signal.aborted)
        setError(cause instanceof Error ? cause.message : String(cause))
    })
    return () => abort.abort()
  }, [connection, reconnect, receiveSnapshot])
  const controls = error && (
    <div className="server-town-controls">
      {error && (
        <Action onClick={() => setReconnect((value) => value + 1)}>
          Reconnect
        </Action>
      )}
    </div>
  )
  return (
    <>
      {snapshot ? (
        <Town
          key={access.id}
          timeline={range ? { ...range, end: Math.max(range.end, Date.now()), at: selectedTime, select: setSelectedTime, loading: historyLoading, error: historyError } : undefined}
          historical={historical}
          inbox={snapshot.inbox}
          onRetry={historical ? undefined : async () => { receiveSnapshot(await connection.resume()); setError(undefined) }}
          onInbox={historical ? undefined : async input => { const result = await connection.inboxAction(input); receiveSnapshot(await connection.snapshot()); return result }}
          mcp={snapshot.mcp}
          onMcp={!historical && snapshot.mcp ? async command => { const result = await connection.updateMcp(command); receiveSnapshot(await connection.snapshot()); return result } : undefined}
          readResidentEvents={historical ? undefined : connection.readResidentEvents}
          packages={snapshot.packages}
          onUpdatePackage={!historical && snapshot.packages ? async update => { receiveSnapshot(await connection.updatePackage(update)) } : undefined}
          config={snapshot.config}
          residents={snapshot.residents}
          palettes={snapshot.palettes}
          messages={snapshot.messages}
          karma={snapshot.karma}
          artifacts={snapshot.artifacts}
          missions={snapshot.missions}
          library={snapshot.library}
          readLibrary={history ? async id => { const doc = history.references.find(doc => doc.id === id); if (!doc) throw Error("Reference unavailable at this time."); return doc } : connection.readLibrary}
          uploadLibrary={historical ? undefined : connection.uploadLibrary}
          readArtifact={history ? async (path, revision) => { const versions = history.documents.filter(doc => doc.path === path).sort((a,b) => a.revision - b.revision); const artifact = revision === undefined ? versions.at(-1) : versions.find(doc => doc.revision === revision); if (!artifact) throw Error("File unavailable at this time."); return { artifact, history: versions } } : connection.readArtifact}
          workspaceReader={history ? { listMissionFiles: async id => [...(history.files[id] ?? [])], readMissionFile: async (id, path) => { const file = history.files[id]?.find(file => file.path === path); if (!file) throw Error("File unavailable at this time."); return file } } : connection}
          onReview={historical ? undefined : connection.reviewMission}
          state={snapshot.state}
          policy={snapshot.policy}
          onSubmit={historical ? readOnly : connection.post}
          onToggle={() => {
            if (historical) return
            void (
              snapshot.state.running ? connection.pause() : connection.resume()
            ).then(receiveSnapshot, (cause) => setError(String(cause)))
          }}
          onAddBudget={async (amount, operationId) => { if (historical) return; receiveSnapshot(await connection.addBudget(amount, operationId)) }}
          onLeave={onLeave}
          model={snapshot.model}
          maxConcurrent={snapshot.maxConcurrent}
          error={error ?? snapshot.state.error}
          footerActions={controls}
        />
      ) : (
        <div className="server-loading">
          {error ? <p role="alert">{error}</p> : "Connecting to your town…"}{" "}
          <Action onClick={onLeave}>Back</Action>
          {controls}
        </div>
      )}
    </>
  )
}
