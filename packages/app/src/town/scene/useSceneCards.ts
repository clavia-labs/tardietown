import { useCallback, useLayoutEffect, useRef, type RefObject } from "react"
import type { Camera, Group } from "three"
import { anchorCards } from "./anchorCards"
import { dragCards } from "./dragCards"

/** Observe layout events, rather than measuring every card on every animation frame. */
export function useSceneCards(surface: RefObject<HTMLDivElement | null>) {
  const scene = useRef<{ town: Group; camera: Camera } | null>(null)
  const position = useCallback(() => {
    if (surface.current && scene.current) anchorCards(surface.current, scene.current.town, scene.current.camera)
  }, [surface])

  useLayoutEffect(() => {
    const root = surface.current?.closest<HTMLElement>(".entry-land, .browser-town-view-content")
    if (!root) return
    const panels = new Set<Element>()
    const resize = new ResizeObserver(position)
    resize.observe(root)
    const sync = () => {
      const current = new Set(root.querySelectorAll("[data-scene-card]"))
      for (const panel of panels) if (!current.has(panel)) { resize.unobserve(panel); panels.delete(panel) }
      for (const panel of current) if (!panels.has(panel)) { resize.observe(panel); panels.add(panel) }
      position()
    }
    const observer = new MutationObserver(records => {
      // New cards and expansion matter; streaming text/speech bubbles do not.
      if (records.some(record => record.type === "attributes" || [...record.addedNodes, ...record.removedNodes].some(node =>
        node instanceof Element && (node.matches("[data-scene-card]") || node.querySelector("[data-scene-card]"))
      ))) sync()
    })
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-expanded"] })
    const stopDragging = dragCards(root)
    window.addEventListener("resize", position)
    sync()
    return () => { observer.disconnect(); resize.disconnect(); stopDragging(); window.removeEventListener("resize", position) }
  }, [position, surface])

  return useCallback((town: Group, camera: Camera) => {
    const changed = scene.current?.town !== town || scene.current?.camera !== camera
    scene.current = { town, camera }
    if (changed) position()
  }, [position])
}
