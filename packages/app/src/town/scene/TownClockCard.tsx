import { Slider } from "@base-ui/react/slider"
import { Clock, X } from "lucide-react"
import { Action, IconButton } from "../ui/controls"
import type { TownTimeline } from "../protocol"

export function TownClockCard({ time, timeline, onClose }: { time: Date; timeline?: TownTimeline | undefined; onClose: () => void }) {
  const shown = new Date(timeline?.at ?? time.getTime())
  return <aside data-scene-card="clock" className="town-clock-panel" aria-label="Town clock">
    <header><Clock size={16} aria-hidden="true" /><strong>Town clock</strong><IconButton variant="ghost" type="button" label="Close clock" onClick={onClose}><X size={16} /></IconButton></header>
    <time dateTime={shown.toISOString()}>{shown.toLocaleTimeString()}</time>
    <p>{shown.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} · {Intl.DateTimeFormat().resolvedOptions().timeZone}</p>
    {timeline && <div className="clock-timeline">
      <div className="clock-history-field"><span>Town history</span><Slider.Root className="ui-slider" min={timeline.start} max={timeline.end} step={1} value={timeline.at ?? timeline.end} onValueChange={at => timeline.select(at >= timeline.end ? undefined : at)}><Slider.Control className="ui-slider-control"><Slider.Track className="ui-slider-track"><Slider.Indicator className="ui-slider-indicator" /><Slider.Thumb className="ui-slider-thumb" aria-label="Town history" /></Slider.Track></Slider.Control></Slider.Root></div>
      <div><span>Past</span><Action type="button" onClick={() => timeline.select(undefined)}>{timeline.at === undefined ? "Live" : "Back to live"}</Action></div>
      {timeline.loading && <small role="status">Loading history…</small>}{timeline.error && <small role="alert">{timeline.error}</small>}
    </div>}
  </aside>
}
