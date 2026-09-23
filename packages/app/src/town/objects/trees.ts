import * as THREE from "three"
import { box } from "../scene/duckModel"

export function createTrees() {
  const trees = new THREE.Group()
  trees.name = "trees"
  for (const [x, z] of [[-110, -100], [-70, -120], [115, 95]]) {
    box(trees, [8, 20, 8], [x!, 11, z!], "#8a7860")
    box(trees, [25, 23, 25], [x!, 29, z!], "#7f9e7b")
    box(trees, [18, 14, 18], [x!, 47, z!], "#93b18a")
  }
  return trees
}
