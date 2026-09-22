import { reconcileColonySnapshot } from "./snapshot"
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react"
import { TownSetup } from "./TownSetup"
import { Town } from "./Town"
import {
  DEFAULT_MAX_AGENTS,
  DEFAULT_AGENT_COUNT,
  DEFAULT_MESSAGES_PER_AGENT,
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
  const [turns, setTurns] = useState(
    DEFAULT_AGENT_COUNT * DEFAULT_MESSAGES_PER_AGENT
  )
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
          "Colony server unavailable. Start it with bun run dev:colony-server."
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
        maxTurns: turns
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
          Resume colony
        </button>
      )}
      <TownSetup
        maxAgents={info?.maxAgents ?? DEFAULT_MAX_AGENTS}
        onCreate={(value) => {
          setConfig(value)
          setTurns(value.count * value.messagesPerAgent)
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
            <h2 id="server-connect-title">Let the colony settle in</h2>
            <p>
              The server runs your residents and keeps their forum open when you
              close this tab. Colonies last until the server stops.
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
                Turn budget
                <input
                  type="number"
                  min={config.count}
                  max={info?.maxTurns}
                  value={turns}
                  onChange={(event) => setTurns(Number(event.target.value))}
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
                  {starting ? "Starting…" : "Start colony"}
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
  const [stopping, setStopping] = useState(false)
  useEffect(() => {
    const abort = new AbortController()
    setError(undefined)
    void connection.watch(receiveSnapshot, abort.signal).catch((cause) => {
      if (!abort.signal.aborted)
        setError(cause instanceof Error ? cause.message : String(cause))
    })
    return () => abort.abort()
  }, [connection, reconnect, receiveSnapshot])
  const stop = async () => {
    setStopping(true)
    try {
      await connection.stop()
      sessionStorage.removeItem(accessKey(access.id))
      onLeave()
    } catch (cause) {
      setError(String(cause))
      setStopping(false)
    }
  }
  const controls = (
    <div className="server-colony-controls">
      {error && (
        <button onClick={() => setReconnect((value) => value + 1)}>
          Reconnect
        </button>
      )}
      <button
        onClick={() => {
          void stop()
        }}
        disabled={stopping}
      >
        {stopping ? "Stopping…" : "Stop colony"}
      </button>
    </div>
  )
  return (
    <>
      {snapshot ? (
        <Town
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
          state={snapshot.state}
          policy={snapshot.policy}
          onSubmit={connection.post}
          onToggle={() => {
            void (
              snapshot.state.running ? connection.pause() : connection.resume()
            ).then(receiveSnapshot, (cause) => setError(String(cause)))
          }}
          onLeave={onLeave}
          model={snapshot.model}
          maxConcurrent={snapshot.maxConcurrent}
          error={error ?? snapshot.state.error}
          footerActions={controls}
        />
      ) : (
        <div className="server-loading">
          {error ? <p role="alert">{error}</p> : "Connecting to your colony…"}{" "}
          <button onClick={onLeave}>Back</button>
          {controls}
        </div>
      )}
    </>
  )
}
