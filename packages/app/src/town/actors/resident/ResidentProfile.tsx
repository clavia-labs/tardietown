import { MessageTime } from "../../../ui/MessageTime"
import type { ForumMessage } from "./components/forum"
import { residentPointerEvents } from "../../scene/residentPointer"
import { useEffect, useRef, useState } from "react"
import { ResidentAvatar } from "../../scene/ResidentAvatar"
import type { Resident } from "../../world"

export function ResidentProfile({ resident, messages, karma, onClose }: {
  resident: Resident
  karma: number
  messages: readonly ForumMessage[]
  onClose: () => void
}) {
  const [tab, setTab] = useState<"posts" | "replies">("posts")
  const card = useRef<HTMLElement>(null)
  const close = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    close.current?.focus({ preventScroll: true })
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") onClose() }
    let down: { x: number; y: number } | undefined
    const pointerDown = (event: PointerEvent) => { down = { x: event.clientX, y: event.clientY } }
    const outside = (event: PointerEvent) => {
      if (residentPointerEvents.has(event)) return
      if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) return
      if (event.target instanceof Node && !card.current?.contains(event.target)) onClose()
    }
    window.addEventListener("keydown", key)
    window.addEventListener("pointerdown", pointerDown)
    window.addEventListener("pointerup", outside)
    return () => {
      window.removeEventListener("keydown", key)
      window.removeEventListener("pointerdown", pointerDown)
      window.removeEventListener("pointerup", outside)
    }
  }, [onClose])
  const contributions = messages.filter((message) => message.author === resident.id)
  const activity = contributions.filter(message => tab === "posts" ? !message.parentId : !!message.parentId).toReversed()
  return (
    <aside ref={card} className="resident-profile" aria-label={`${resident.name}'s profile`}>
      <button className="resident-profile-close" ref={close} type="button" onClick={onClose} aria-label="Close resident profile">×</button>
      <div className="resident-profile-identity">
        <ResidentAvatar index={resident.index} />
        <div><h2>{resident.name}</h2><p className="resident-profile-karma">{karma} karma</p></div>
      </div>
      <div className="resident-activity-tabs" role="group" aria-label="Resident activity">
        <button type="button" aria-pressed={tab === "posts"} onClick={() => setTab("posts")}>Posts · {contributions.filter(message => !message.parentId).length}</button>
        <button type="button" aria-pressed={tab === "replies"} onClick={() => setTab("replies")}>Replies · {contributions.filter(message => message.parentId).length}</button>
      </div>
      <div className="resident-activity" tabIndex={0} aria-label={`${resident.name}'s ${tab}`}>
        {activity.length ? activity.map(message => {
          const thread = messages.find(entry => entry.id === message.threadId)
          return <article key={message.id}>
            <header><span>{message.parentId ? "Replied" : "Posted"}</span><MessageTime at={message.at} /></header>
            {(message.title || thread?.title) && <h3>{message.title ?? thread?.title}</h3>}
            <p>{message.body}</p>
            <small>↑ {message.score ?? 0} · {message.parentId ? "Reply" : `${messages.filter(entry => entry.threadId === message.id && entry.parentId).length} replies`}</small>
          </article>
        }) : <p className="resident-activity-empty">No {tab} yet.</p>}
      </div>
    </aside>
  )
}
