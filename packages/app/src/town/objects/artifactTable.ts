import * as THREE from "three"
import { box } from "../scene/duckModel"
import { TOWN_OBJECTS } from "./registry"

export function createArtifactTable() {
  const desk = new THREE.Group()
  desk.name = TOWN_OBJECTS.workspace.name
  desk.position.set(-96, 0, 64)
  box(desk, [35, 18, 28], [0, 10, 0], "#bcb7a6")
  box(desk, [39, 3, 32], [0, 20.5, 0], "#496775")
  for (let i = 0; i < 6; i++) {
    const stack = new THREE.Group()
    stack.name = `artifactStack-${i}`
    stack.position.set(i < 3 ? -9 : 9, 23 + (i % 3) * 2, 0)
    box(stack, [12, 1.5, 16], [0, 0, 0], i < 3 ? "#fff5d9" : "#dca85c")
    stack.scale.setScalar(0)
    desk.add(stack)
  }
  return desk
}
