import { useEffect, useState } from "react"
import { type PreviewView } from "../../town/scene/ThreePreview"
import { createRoot } from "react-dom/client"
import { CrewDuck } from "../../town/scene/ColonyPreview"
import { DUCK_PALETTES as palettes } from "../../town/scene/duckPalettes"
import {
  DEFAULT_DUCK_MOTION,
  NEUTRAL_DUCK_POSE,
  sampleDuckBehavior,
  type DuckBehavior,
  type DuckPose
} from "../../town/scene/duckRig"
import { makeResidents } from "../../town/world"
import "../../town/setup.css"
import "./styles.css"

const resident = makeResidents(1)[0]!

const poseControls = [
  { key: "stretch", label: "Height", min: -1, max: 1 },
  { key: "look", label: "Look", min: -1, max: 1 },
  { key: "nod", label: "Nod", min: -1, max: 1 },
  { key: "step", label: "Step", min: 0, max: 1 },
  { key: "mouth", label: "Mouth", min: 0, max: 1 }
] as const
const behaviors: { key: DuckBehavior; label: string }[] = [
  { key: "stretch", label: "Stretch" },
  { key: "crouch", label: "Crouch" },
  { key: "look", label: "Look around" },
  { key: "step", label: "Step" },
  { key: "talk", label: "Talk" }
]

function DuckStudy() {
  const [pose, setPose] = useState<DuckPose>({ ...NEUTRAL_DUCK_POSE })
  const [playing, setPlaying] = useState<{ behavior: DuckBehavior } | null>(
    null
  )
  useEffect(() => {
    if (!playing) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPose(sampleDuckBehavior(playing.behavior, 0.35))
      setPlaying(null)
      return
    }
    const start = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const progress = Math.min(
        (now - start) / DEFAULT_DUCK_MOTION.durationMs,
        1
      )
      setPose(sampleDuckBehavior(playing.behavior, progress))
      if (progress < 1) frame = requestAnimationFrame(tick)
      else {
        setPlaying(null)
        setPose({ ...NEUTRAL_DUCK_POSE })
      }
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing])
  const [selectedPalette, setSelectedPalette] = useState(0)
  const palette = palettes[selectedPalette]!.colors
  const [revision, setRevision] = useState(0)
  const [view, setView] = useState<PreviewView>("isometric")
  return (
    <main className="duck-page">
      <header className="duck-page-header">
        <h1>Duck study</h1>
        <a href="./grid.html">Grid playground ↗</a>
      </header>
      <aside className="duck-palette" aria-label="Duck color palettes">
        {palettes.map(({ name, colors }, index) => (
          <button
            key={name}
            type="button"
            className="duck-palette-swatch"
            title={name}
            aria-label={`${name} palette`}
            aria-pressed={selectedPalette === index}
            onClick={() => setSelectedPalette(index)}
          >
            <span
              style={{
                background: `linear-gradient(135deg, ${colors.shell} 0% 62%, ${colors.jaw} 62% 82%, ${colors.frame} 82% 100%)`
              }}
            />
          </button>
        ))}
      </aside>
      <figure className="duck-stage">
        <div
          className="colony-resident duck-study"
          role="img"
          aria-label={`${resident.name}, a robot duck with a circular eye, flush hinged jaw and broad feet, a cuboid neck and torso, cylindrical legs and hinges, and a colored identification panel`}
        >
          <CrewDuck
            key={revision}
            color={resident.color}
            view={view}
            palette={palette}
            pose={pose}
          />
        </div>
        <figcaption>{resident.name} / Isometric crew character</figcaption>
      </figure>
      <div className="duck-view-controls" aria-label="Camera view">
        {(["isometric", "front", "side", "back"] as const).map((angle) => (
          <button
            key={angle}
            type="button"
            aria-pressed={view === angle}
            onClick={() => {
              setView(angle)
              setRevision((value) => value + 1)
            }}
          >
            {angle}
          </button>
        ))}
      </div>
      <p className="duck-page-note">Hover to open the mouth. Drag to rotate.</p>
      <section className="duck-motion" aria-label="Movement controls">
        <div className="duck-motion-header">
          <h2>Movement</h2>
          <button
            type="button"
            onClick={() => {
              setPlaying(null)
              setPose({ ...NEUTRAL_DUCK_POSE })
            }}
          >
            Reset pose
          </button>
        </div>
        <div className="duck-behaviors">
          {behaviors.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              aria-pressed={playing?.behavior === key}
              onClick={() => {
                setPose({ ...NEUTRAL_DUCK_POSE })
                setPlaying({ behavior: key })
              }}
            >
              {label}
            </button>
          ))}
          {playing && (
            <button type="button" onClick={() => setPlaying(null)}>
              Pause
            </button>
          )}
        </div>
        <div className="duck-pose-sliders">
          {poseControls.map(({ key, label, min, max }) => (
            <label key={key}>
              <span>
                {label}
                <output>{Math.round(pose[key] * 100)}%</output>
              </span>
              <input
                type="range"
                min={min}
                max={max}
                step="0.01"
                value={pose[key]}
                aria-label={label}
                onChange={(event) => {
                  setPlaying(null)
                  setPose((current) => ({
                    ...current,
                    [key]: Number(event.target.value)
                  }))
                }}
              />
            </label>
          ))}
        </div>
      </section>
    </main>
  )
}

createRoot(document.getElementById("root")!).render(<DuckStudy />)
