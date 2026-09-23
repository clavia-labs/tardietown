import * as THREE from "three"
import { box } from "../scene/duckModel"

export function createGround(gridSize: number, worldSize: number) {
  const ground = new THREE.Group()
  ground.name = "ground"
  box(ground, [worldSize, 12, worldSize], [0, -6, 0], "#80937b")
  for (let u = 0; u < gridSize; u++) {
    for (let v = 0; v < gridSize; v++) {
      const path = u === gridSize / 2 - 1 || u === gridSize / 2 || v === gridSize / 2 - 1 || v === gridSize / 2
      box(ground, [31.4, 1, 31.4], [(u - (gridSize - 1) / 2) * 32, 0.5, (v - (gridSize - 1) / 2) * 32],
        path ? "#d5d2b8" : (u + v) % 2 ? "#a8ba91" : "#b3c19b")
    }
  }
  return ground
}
