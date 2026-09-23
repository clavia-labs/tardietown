import { useCallback } from "react"
import * as THREE from "three"
import { createDuck, applyDuckPalette, type DuckPalette } from "./duckModel"
import { applyDuckPose, NEUTRAL_DUCK_POSE, DEFAULT_DUCK_MOTION, type DuckPose, type DuckMotion } from "./duckRig"
import { ThreePreview, type PreviewView } from "./ThreePreview"

export const DEFAULT_JAW_HOVER = {
  objectName: "jaw",
  rotationX: Math.PI / 9,
  durationMs: 220
}

export function CrewDuck({
  color,
  palette,
  pose = NEUTRAL_DUCK_POSE,
  motion = DEFAULT_DUCK_MOTION,
  hoverMotion = DEFAULT_JAW_HOVER,
  view = "isometric"
}: {
  color: string
  palette?: DuckPalette
  pose?: DuckPose
  motion?: DuckMotion
  hoverMotion?: typeof DEFAULT_JAW_HOVER
  view?: PreviewView
}) {
  const build = useCallback(() => createDuck(color), [color])
  const update = useCallback((model: THREE.Group) => {
    if (palette) applyDuckPalette(model, palette)
    applyDuckPose(model, pose, motion)
  }, [palette, pose, motion])
  return <ThreePreview build={build} update={update} hoverMotion={hoverMotion} height={165} targetY={67}
    interactive view={view} label="Robot duck in 3D. Drag to rotate." />
}
