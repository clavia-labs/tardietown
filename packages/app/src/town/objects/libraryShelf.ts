import * as THREE from "three"
import { box } from "../scene/duckModel"
import { TOWN_OBJECTS } from "./registry"

export function createLibraryShelf() {
  const shelf = new THREE.Group()
  shelf.name = TOWN_OBJECTS.library.name
  shelf.position.set(-148, 0, -80)
  shelf.rotation.y = Math.PI / 2
  box(shelf, [38, 34, 3], [0, 18, -5], "#8d7658")
  for (const x of [-19, 19]) box(shelf, [3, 36, 14], [x, 18, 0], "#b29a74")
  for (const y of [2, 18, 35]) box(shelf, [38, 3, 14], [0, y, 0], "#b29a74")
  const bookColors = ["#749b9b", "#d8ae61", "#a87968", "#89996c", "#9a8fa8", "#d4c6a1"]
  for (let row = 0; row < 2; row++) for (let i = 0; i < 6; i++) {
    const height = 10 + i % 3
    box(shelf, [4, height, 9], [-14 + i * 5.4, 4 + row * 16 + height / 2, 1], bookColors[(i + row * 2) % bookColors.length]!)
    box(shelf, [3, 0.8, 0.3], [-14 + i * 5.4, 7 + row * 16, 5.7], "#eee3cb")
  }
  return shelf
}
