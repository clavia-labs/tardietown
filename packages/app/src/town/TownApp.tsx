import { reconcileColonySnapshot } from "./snapshot"
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react"
import { TownSetup } from "./TownSetup"
import { Town } from "./Town"
import {
  DEFAULT_MAX_AGENTS,
  type WorldConfig
} from "./world"
import { DEFAULT_FORUM_CONCURRENCY } from "./actors/forum/session"
import { DEFAULT_FORUM_TOOL_LIMIT } from "./actors/resident/policy"
import {
  createServerColony,
  serverConnection,
  serverInfo,
  type ColonyAccess
} from "./connection"
import {
  DEFAULT_SERVER_TURN_TIMEOUT_MS,
  type ColonySnapshot,
  type ColonyServerInfo
} from "./protocol"

const accessKey = (id: string) => `terrarium-server:${id}`
function restoredAccess(): ColonyAccess | null {
  const id = new URL(location.href).searchParams.get("colony")
  const token = id ? sessionStorage.getItem(accessKey(id)) : null
  return id && token ? { id, token } : null
}
export function TownApp() {
  const [access, setAccess] = useState(restoredAccess)
  const [recent, setRecent] = useState<string | null>(() =>
    sessionStorage.getItem("terrarium-server:last")
  )
  const [config, setConfig] = useState<WorldConfig | null>(null)
  const [info, setInfo] = useState<ColonyServerInfo>()
  const [error, setError] = useState<string>()
  const [starting, setStarting] = useState(false)
  const [parallel, setParallel] = useState(DEFAULT_FORUM_CONCURRENCY)
  const [tools, setTools] = useState(DEFAULT_FORUM_TOOL_LIMIT)
  const [budgetUsd, setBudgetUsd] = useState(1)
  const [timeout, setTimeoutSeconds] = useState(
    DEFAULT_SERVER_TURN_TIMEOUT_MS / 1000
  )
  useEffect(() => {
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
    const url = new URL(location.href)
    url.searchParams.delete("colony")
    history.replaceState(null, "", url)
  }
  if (access) return <ServerColony access={access} onLeave={leave} />
  const start = async (event: FormEvent) => {
    event.preventDefault()
    if (!config || !info || starting) return
    setStarting(true)
    setError(undefined)
    try {
      const result = await createServerColony({
        config: { ...config, timeoutMs: timeout * 1000 },
        maxConcurrent: parallel,
        maxToolCalls: tools,
        maxTurns: info.maxTurns,
        budgetUsd
      })
      sessionStorage.setItem(accessKey(result.id), result.token)
      sessionStorage.setItem("terrarium-server:last", result.id)
      setRecent(result.id)
      const url = new URL(location.href)
      url.searchParams.set("colony", result.id)
      history.replaceState(null, "", url)
      setAccess({ id: result.id, token: result.token })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setStarting(false)
    }
  }
  return (
    <>
      {recent && sessionStorage.getItem(accessKey(recent)) && (
        <button
          className="server-resume"
          onClick={() => {
            setAccess({
              id: recent,
              token: sessionStorage.getItem(accessKey(recent))!
            })
            const url = new URL(location.href)
            url.searchParams.set("colony", recent)
            history.replaceState(null, "", url)
          }}
        >
          Resume town
        </button>
      )}
      <TownSetup
        maxAgents={info?.maxAgents ?? DEFAULT_MAX_AGENTS}
        onCreate={(value) => {
          setConfig(value)
        }}
      />
      {config && (
        <div className="browser-connect-backdrop">
          <section
            className="browser-connect"
            role="dialog"
            aria-modal="true"
            aria-labelledby="server-connect-title"
          >
            <h2 id="server-connect-title">Start your town</h2>
            <p>
              The server runs your residents and keeps their forum open when you
              close this tab. Towns last until the server stops.
            </p>
            <p>
              Model: {info?.model ?? "Connecting…"}. Provider keys stay on the
              server.
            </p>
            <form
              onSubmit={(event) => {
                void start(event)
              }}
            >
              <label>
                Parallel residents
                <input
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
                <input
                  type="number"
                  min={0.01}
                  max={100}
                  step={0.01}
                  value={budgetUsd}
                  onChange={(event) => setBudgetUsd(Number(event.target.value))}
                  required
                />
              </label>
              <details className="forum-run-settings">
                <summary>Run settings</summary>
                <label>
                  Tool calls per turn
                  <input
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
                  <input
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
              </details>
              {error && (
                <p role="alert" className="browser-error">
                  {error}
                </p>
              )}
              <div>
                <button
                  type="button"
                  onClick={() => setConfig(null)}
                  disabled={starting}
                >
                  Back
                </button>
                <button type="submit" disabled={!info || starting}>
                  {starting ? "Starting…" : "Start town"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  )
}
function ServerColony({
  access,
  onLeave
}: {
  access: ColonyAccess
  onLeave: () => void
}) {
  const connection = useMemo(() => serverConnection(access), [access])
  const [snapshot, setSnapshot] = useState<ColonySnapshot>()
  const receiveSnapshot = useCallback((next: ColonySnapshot) => setSnapshot((previous) => reconcileColonySnapshot(previous, next)), [])
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
    <div className="server-colony-controls">
      {error && (
        <button onClick={() => setReconnect((value) => value + 1)}>
          Reconnect
        </button>
      )}
    </div>
  )
  return (
    <>
      {snapshot ? (
        <Town
          readResidentEvents={connection.readResidentEvents}
          packages={snapshot.packages}
          onUpdatePackage={snapshot.packages ? async update => { receiveSnapshot(await connection.updatePackage(update)) } : undefined}
          config={snapshot.config}
          residents={snapshot.residents}
          palettes={snapshot.palettes}
          messages={snapshot.messages}
          karma={snapshot.karma}
          artifacts={snapshot.artifacts}
          missions={snapshot.missions}
          library={snapshot.library}
          readLibrary={connection.readLibrary}
          readArtifact={connection.readArtifact}
          workspaceReader={connection}
          onReview={connection.reviewMission}
          state={snapshot.state}
          policy={snapshot.policy}
          onSubmit={connection.post}
          onToggle={() => {
            void (
              snapshot.state.running ? connection.pause() : connection.resume()
            ).then(receiveSnapshot, (cause) => setError(String(cause)))
          }}
          onAddBudget={async (amount, operationId) => { receiveSnapshot(await connection.addBudget(amount, operationId)) }}
          onLeave={onLeave}
          model={snapshot.model}
          maxConcurrent={snapshot.maxConcurrent}
          error={error ?? snapshot.state.error}
          footerActions={controls}
        />
      ) : (
        <div className="server-loading">
          {error ? <p role="alert">{error}</p> : "Connecting to your town…"}{" "}
          <button onClick={onLeave}>Back</button>
          {controls}
        </div>
      )}
    </>
  )
}
