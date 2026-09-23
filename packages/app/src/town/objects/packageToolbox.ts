import * as THREE from "three"
import { box } from "../scene/duckModel"
import { TOWN_OBJECTS } from "./registry"

export function createPackageToolbox(worldSize: number) {
  const toolbox = new THREE.Group()
  toolbox.name = TOWN_OBJECTS.packages.name
  toolbox.position.set(worldSize / 2 - 24, 0, -worldSize / 2 + 24)
  box(toolbox, [30, 17, 22], [0, 9, 0], "#718578")
  box(toolbox, [32, 4, 24], [0, 19, 0], "#536b60")
  box(toolbox, [15, 3, 4], [0, 27, 0], "#46584d")
  for (const x of [-6, 6]) box(toolbox, [3, 6, 4], [x, 23, 0], "#46584d")
  box(toolbox, [8, 8, 3], [0, 15, 13], "#c6a263")
  box(toolbox, [2, 3, 1], [0, 15, 15], "#62533c")
  return toolbox
}
