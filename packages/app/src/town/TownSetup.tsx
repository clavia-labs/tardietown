import { Textarea, IconButton, Input } from "./ui/controls"
import { DEFAULT_SERVER_TURN_TIMEOUT_MS } from "./protocol"
import { useMemo, useState, type FormEvent } from "react"
import { ArrowRight } from "lucide-react"
import { DemoTownScene } from "./scene/DemoTownScene"
import {
  DEFAULT_AGENT_COUNT,
  DEFAULT_BUBBLE_CHARACTERS,
  DEFAULT_MESSAGES_PER_AGENT,
  DEFAULT_POST_WORDS,
  makeResidents,
  type WorldConfig
} from "./world"

const townPrefixes = ["Willow", "Clover", "Maple", "Mossy", "Sunny", "Fern", "Amber", "Pebble", "Cedar", "Hazel", "Moonlit", "Bramble"]
const townPlaces = ["Haven", "Hollow", "Grove", "Meadow", "Brook", "Vale", "Crossing", "Bay", "Hill", "Creek", "Glade", "Landing"]
const randomTownName = () =>
  `${townPrefixes[Math.floor(Math.random() * townPrefixes.length)]} ${townPlaces[Math.floor(Math.random() * townPlaces.length)]}`

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
  const [suggestedName] = useState(randomTownName)
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
    if (mission.trim())
      onCreate({
        ...defaults,
        count,
        name: name.trim() || suggestedName,
        premise: mission.trim()
      })
  }
  return (
    <main className="entry-minimal mx-auto flex h-svh min-h-0 w-full max-w-[var(--container)] flex-col items-center px-6 pt-[clamp(32px,6vh,56px)] pb-4 max-[600px]:px-[18px] max-[600px]:pt-10 max-[600px]:pb-3">
      <h1 className="entry-title relative z-[2] mb-[22px] shrink-0 text-center font-[Georgia,serif] text-[clamp(28px,3.5vw,42px)] leading-[1.15] italic tracking-[-.035em] text-town-ink">Tardie Town</h1>
      <form className="entry-name-form relative z-20 grid w-full max-w-[480px] shrink-0 gap-3" onSubmit={submit}>
        <Input
          className="h-[60px] px-5 py-[14px] font-town text-xl leading-normal tracking-[-.02em] max-[600px]:text-lg"
          id="swarm-name"
          aria-label="Town name"
          placeholder={suggestedName}
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="off"
        />
        <div className="entry-mission-field relative">
          <Textarea
            className="block h-[104px] min-h-[104px] resize-none px-5 py-[14px] pr-[62px] font-town text-xl leading-normal tracking-[-.02em] max-[600px]:text-lg"
            id="town-mission"
            rows={3}
            aria-label="Mission"
            placeholder="Give them a mission"
            value={mission}
            onChange={(event) => setMission(event.target.value)}
            required
            autoComplete="off"
          />
          <IconButton
            className="absolute top-2 right-2 h-11 w-11"
            variant="primary"
            label="Start town"
            type="submit"
            aria-label="Start town"
            disabled={!mission.trim()}
          >
            <ArrowRight size={22} strokeWidth={1.5} />
          </IconButton>
        </div>
        <div className="entry-swarm-size flex items-center justify-between gap-4 p-0.5 font-town-mono text-xs text-town-muted">
          <label htmlFor="swarm-size">Town size</label>
          <div className="entry-swarm-stepper flex items-center gap-2">
            <Input
              className="h-9 w-14 p-0 text-center font-town-mono text-[13px]"
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
        className="entry-land relative mt-3 min-h-0 w-full flex-1 max-[600px]:mt-2"
        aria-label={`Your town with ${count} residents`}
      >
        <DemoTownScene residents={residents} />
      </section>
      <footer className="entry-powered pointer-events-none relative z-[2] w-full shrink-0 self-stretch pt-2 text-right">
        <a href="https://github.com/clavia-labs/tardigrade" target="_blank" rel="noopener noreferrer">
          Powered by Tardigrade
        </a>
      </footer>
    </main>
  )
}
