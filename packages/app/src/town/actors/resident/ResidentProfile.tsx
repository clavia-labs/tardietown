import { residentPointerEvents } from "../../scene/residentPointer"
import { useEffect, useRef } from "react"
import { ResidentAvatar } from "../../scene/ResidentAvatar"
import type { Resident } from "../../world"

export function ResidentProfile({ resident, messages, onClose }: {
  resident: Resident
  messages: readonly { author: string; parentId?: string; score?: number }[]
  onClose: () => void
}) {
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
  const karma = contributions.reduce((sum, message) => sum + (message.score ?? 0), 0)
  return (
    <aside ref={card} className="resident-profile" aria-label={`${resident.name}'s profile`}>
      <header>
        <span>Resident</span>
        <button ref={close} type="button" onClick={onClose} aria-label="Close resident profile">×</button>
      </header>
      <div className="resident-profile-identity">
        <ResidentAvatar index={resident.index} />
        <div><h2>{resident.name}</h2><p>{resident.role}</p></div>
      </div>
      <dl>
        <div><dt>Karma</dt><dd>{karma}</dd></div>
        <div><dt>Threads</dt><dd>{contributions.filter((message) => !message.parentId).length}</dd></div>
        <div><dt>Replies</dt><dd>{contributions.filter((message) => message.parentId).length}</dd></div>
      </dl>
    </aside>
  )
}
