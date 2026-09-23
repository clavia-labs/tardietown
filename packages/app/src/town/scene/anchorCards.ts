import * as THREE from "three"
import { TOWN_OBJECTS } from "../objects"
import { clampCard, placeCard, cardUpdate, type CardLayout, type Rect } from "./cardPlacement"

const placements = new WeakMap<HTMLElement, CardLayout>()
const anchors: Record<string, { object: string; height: number; preference: "above-right" | "beside" }> = {
  ...Object.fromEntries(Object.entries(TOWN_OBJECTS).map(([key, { name, height, preference }]) => [key, { object: name, height, preference }])),
  resident: { object: "", height: 38, preference: "beside" },
  residents: { object: TOWN_OBJECTS.forum.name, height: 55, preference: "beside" }
}

/** Visible scene bounds. All geometry uses viewport coordinates until the final write. */
export function cardBounds(root: HTMLElement): Rect {
  const rect = root.getBoundingClientRect()
  const form = root.closest(".entry-minimal")?.querySelector(".entry-name-form")?.getBoundingClientRect()
  return { left: Math.max(12, rect.left + 12), right: Math.min(window.innerWidth - 12, rect.right - 12),
    top: Math.max(12, form?.top ?? rect.top + 12), bottom: Math.max(52, Math.min(window.innerHeight - 12, rect.bottom - 12)) }
}
export function writeCardPosition(panel: HTMLElement, x: number, y: number) {
  const parent = panel.offsetParent
  if (!(parent instanceof HTMLElement)) return
  const origin = parent.getBoundingClientRect()
  panel.style.left = `${x - origin.left + parent.scrollLeft}px`
  panel.style.top = `${y - origin.top + parent.scrollTop}px`
  panel.style.right = "auto"
  panel.style.bottom = "auto"
}

/** Anchor once on opening; content/animation/camera updates never chase the object. */
export function anchorCards(surface: HTMLElement, town: THREE.Group, camera: THREE.Camera) {
  const root = surface.closest<HTMLElement>(".entry-land, .browser-town-view-content")
  const canvas = surface.querySelector("canvas")
  if (!root || !canvas) return
  const viewport = canvas.getBoundingClientRect()
  const bounds = cardBounds(root)
  const reserved = root.closest(".entry-minimal")?.querySelector(".entry-name-form")?.getBoundingClientRect()
  const obstacles: Rect[] = reserved ? [reserved] : []
  const toolbar = root.querySelector(".town-places")?.getBoundingClientRect()
  if (toolbar) obstacles.push(toolbar)
  for (const panel of root.querySelectorAll<HTMLElement>("[data-scene-card]")) {
    if (!panel.offsetParent) continue
    const spec = anchors[panel.dataset.sceneCard ?? ""]
    if (!spec) continue
    panel.style.setProperty("--card-available-height", `${Math.max(80, bounds.bottom - bounds.top)}px`)
    panel.style.setProperty("--card-available-width", `${Math.max(80, bounds.right - bounds.left)}px`)
    const size = { width: panel.offsetWidth, height: panel.offsetHeight }
    const layout = [bounds.right - bounds.left, bounds.bottom - bounds.top, size.width, size.height].join(":")
    const previous = placements.get(panel)
    const next = { layout, expanded: panel.dataset.expanded }
    const update = cardUpdate(previous, next, panel.dataset.dragged === "true")
    if (update === "none") continue
    let position
    if (update === "clamp") {
      const current = panel.getBoundingClientRect()
      position = clampCard({ x: current.left, y: current.top }, size, bounds)
    } else {
      const item = panel.dataset.sceneCard === "resident"
        ? town.children.find(child => child.userData.residentId === panel.dataset.resident)
        : town.getObjectByName(spec.object)
      if (!item) continue
      const world = item.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, spec.height, 0)).project(camera)
      const anchor = { x: viewport.left + (world.x + 1) * viewport.width / 2, y: viewport.top + (1 - world.y) * viewport.height / 2 }
      const occupied = [...root.querySelectorAll<HTMLElement>("[data-scene-card][data-anchored]")]
        .filter(other => other !== panel && other.offsetParent)
        .map(other => other.getBoundingClientRect())
      position = placeCard(anchor, size, bounds, spec.preference, obstacles, occupied)
    }
    writeCardPosition(panel, position.x, position.y)
    panel.dataset.anchored = "true"
    placements.set(panel, next)
  }
}
