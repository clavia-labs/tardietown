import { cardBounds, writeCardPosition } from "./anchorCards"
import { clampCard } from "./cardPlacement"
const cards = "[data-scene-card]"

/** Drag only from card headers; controls and scrolling keep their normal behavior. */
export function dragCards(root: HTMLElement) {
  let drag: { panel: HTMLElement; handle: HTMLElement; id: number; x: number; y: number; left: number; top: number; moved: boolean } | undefined
  const down = (event: PointerEvent) => {
    if (drag || event.button !== 0 || !(event.target instanceof Element)) return
    const active = event.target.closest<HTMLElement>(cards)
    if (active) root.querySelectorAll<HTMLElement>(cards).forEach(panel => { panel.style.zIndex = panel === active ? "18" : "10" })
    if (event.target.closest("button, input, select, textarea, a, summary")) return
    const handle = event.target.closest<HTMLElement>("header, .resident-profile-identity, .browser-board-heading")
    const card = handle?.closest<HTMLElement>(cards)
    if (!handle || !card || !root.contains(card)) return
    // Only the main heading is a drag handle, not post or activity headers.
    if (handle.parentElement !== card && !handle.classList.contains("resident-profile-identity") && card.dataset.sceneCard !== "packages") return
    const panel = card.closest<HTMLElement>(".town-packages-anchor") ?? card
    const parent = panel.offsetParent
    if (!(parent instanceof HTMLElement)) return
    const bounds = panel.getBoundingClientRect()
    drag = { panel, handle, id: event.pointerId, x: event.clientX, y: event.clientY, left: bounds.left, top: bounds.top, moved: false }
    handle.setPointerCapture(event.pointerId)
  }
  const move = (event: PointerEvent) => {
    if (!drag || drag.id !== event.pointerId) return
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y
    if (!drag.moved && Math.hypot(dx, dy) < 4) return
    drag.moved = true
    drag.panel.dataset.dragged = "true"
    const point = clampCard({ x: drag.left + dx, y: drag.top + dy },
      { width: drag.panel.offsetWidth, height: drag.panel.offsetHeight }, cardBounds(root))
    writeCardPosition(drag.panel, point.x, point.y)
    event.preventDefault()
  }
  const end = (event: PointerEvent) => {
    if (!drag || drag.id !== event.pointerId) return
    if (drag.handle.hasPointerCapture(event.pointerId)) drag.handle.releasePointerCapture(event.pointerId)
    drag = undefined
  }
  root.addEventListener("pointerdown", down)
  root.addEventListener("pointermove", move)
  root.addEventListener("pointerup", end)
  root.addEventListener("pointercancel", end)
  return () => {
    root.removeEventListener("pointerdown", down)
    root.removeEventListener("pointermove", move)
    root.removeEventListener("pointerup", end)
    root.removeEventListener("pointercancel", end)
  }
}
