import { DEFAULT_SERVER_TURN_TIMEOUT_MS } from "./protocol"
import { useMemo, useState, type FormEvent } from "react"
import { ArrowRight } from "lucide-react"
import { EntryColonyPreview } from "./scene/EntryColonyPreview"
import {
  DEFAULT_AGENT_COUNT,
  DEFAULT_BUBBLE_CHARACTERS,
  DEFAULT_MESSAGES_PER_AGENT,
  DEFAULT_POST_WORDS,
  makeResidents,
  type WorldConfig
} from "./world"

export const DEFAULT_ENTRY_CONFIG: Omit<WorldConfig, "name"> = {
  count: DEFAULT_AGENT_COUNT,
  premise:
    "Build a cozy little village together. Decide what it needs, share ideas, and find your own place in the community.",
  messagesPerAgent: DEFAULT_MESSAGES_PER_AGENT,
  timeoutMs: DEFAULT_SERVER_TURN_TIMEOUT_MS,
  postWords: DEFAULT_POST_WORDS,
  bubbleCharacters: DEFAULT_BUBBLE_CHARACTERS,
}

export function TownSetup({
  maxAgents,
  onCreate,
  defaults = DEFAULT_ENTRY_CONFIG
}: {
  maxAgents: number
  onCreate: (config: WorldConfig) => void
  defaults?: Omit<WorldConfig, "name">
}) {
  const [name, setName] = useState("")
  const [mission, setMission] = useState("")
  const [swarmSize, setSwarmSize] = useState(
    Math.min(defaults.count, maxAgents)
  )
  const [countDraft, setCountDraft] = useState(String(Math.min(defaults.count, maxAgents)))
  const commitCount = () => {
    const value = Number(countDraft)
    const valid = countDraft.trim() !== "" && Number.isInteger(value) && value >= 1 && value <= maxAgents
    const next = valid ? value : Math.min(swarmSize, maxAgents)
    setSwarmSize(next)
    setCountDraft(String(next))
  }
  const count = Math.min(swarmSize, maxAgents)
  const residents = useMemo(
    () => makeResidents(count, maxAgents),
    [count, maxAgents]
  )
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (name.trim() && mission.trim())
      onCreate({
        ...defaults,
        count,
        name: name.trim(),
        premise: mission.trim()
      })
  }
  return (
    <main className="entry-minimal">
      <h1 className="entry-title">Tardie Town</h1>
      <form className="entry-name-form" onSubmit={submit}>
        <input
          id="swarm-name"
          aria-label="Colony name"
          placeholder="Name your town"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          autoComplete="off"
        />
        <div className="entry-mission-field">
          <textarea
            id="colony-mission"
            rows={3}
            aria-label="Mission"
            placeholder="Give them a mission"
            value={mission}
            onChange={(event) => setMission(event.target.value)}
            required
            autoComplete="off"
          />
          <button
            type="submit"
            aria-label="Create colony"
            disabled={!name.trim() || !mission.trim()}
          >
            <ArrowRight size={22} strokeWidth={1.5} />
          </button>
        </div>
        <div className="entry-swarm-size">
          <label htmlFor="swarm-size">Town size</label>
          <div className="entry-swarm-stepper">
            <input
              id="swarm-size"
              type="number"
              min={1}
              max={maxAgents}
              value={countDraft}
              onChange={(event) => setCountDraft(event.target.value)}
              onBlur={commitCount}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  commitCount()
                  event.currentTarget.blur()
                }
              }}
            />
            <span>{count === 1 ? "resident" : "residents"}</span>
          </div>
        </div>
      </form>
      <section
        className="entry-land"
        aria-label={`Your colony with ${count} agents`}
      >
        <EntryColonyPreview residents={residents} />
      </section>
      <footer className="entry-powered">
        <a href="https://github.com/clavia-labs/tardigrade" target="_blank" rel="noopener noreferrer">
          Powered by Tardigrade
        </a>
      </footer>
    </main>
  )
}
