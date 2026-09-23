import * as THREE from "three"
import { box } from "../scene/duckModel"
import { TOWN_OBJECTS } from "./registry"

export function createMessageBoard() {
  const board = new THREE.Group()
  board.name = TOWN_OBJECTS.forum.name
  box(board, [4, 18, 4], [-20, 10, 0], "#708575")
  box(board, [4, 18, 4], [20, 10, 0], "#708575")
  box(board, [52, 27, 4], [0, 27, 0], "#7a8e7d")
  box(board, [46, 21, 0.6], [0, 27, 2.3], "#e3d9b8")
  for (const [x, y, color] of [[-13, 31, "#f8f1dc"], [1, 26, "#e5b978"], [14, 31, "#b4c7ac"]] as const)
    box(board, [10, 11, 0.4], [x, y, 2.8], color)
  return board
}
