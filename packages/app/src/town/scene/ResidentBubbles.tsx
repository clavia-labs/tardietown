import { Action } from "../ui/controls"
import { bubblePreview, type Post, type Resident } from "../world"

type Anchor = { x: number; y: number; depth: number; occluded: boolean }

export function ResidentBubbles({ residents, anchors, thinking, latestPost, characters, onBoard }: {
  residents: readonly Resident[]
  anchors: Record<string, Anchor>
  thinking?: string | readonly string[] | undefined
  latestPost?: Post | undefined
  characters: number
  onBoard?: (() => void) | undefined
}) {
  return <div className="duck-bubbles" aria-live="polite">
    {residents.map(resident => {
      const anchor = anchors[resident.id]
      const busy = typeof thinking === "string" ? thinking === resident.id : Boolean(thinking?.includes(resident.id))
      const post = latestPost?.author === resident.id ? latestPost : undefined
      if (!anchor || anchor.occluded || (!busy && !post)) return null
      return <div key={resident.id} className="duck-bubble-anchor" style={{ left: `${anchor.x}%`, top: `${anchor.y}%`, zIndex: 1 + Object.values(anchors).filter(other => other.depth > anchor.depth).length }}>
        <Action type="button" className={`duck-speech ${busy ? "duck-thinking" : ""}`} onClick={onBoard}
          aria-label={busy ? `${resident.name} is thinking` : `${resident.name}: ${post!.text}. Open forum`}>
          {!busy && <strong>{resident.name}</strong>}
          {busy ? <span className="duck-thinking-content"><span className="duck-thinking-dots" aria-hidden="true"><i /><i /><i /></span></span>
            : <span className="duck-speech-text">{bubblePreview(post!.text, characters)}</span>}
        </Action>
      </div>
    })}
  </div>
}
