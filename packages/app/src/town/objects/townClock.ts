import * as THREE from "three"
import { box } from "../scene/duckModel"
import { TOWN_OBJECTS } from "./registry"

export function createTownClock(worldSize: number) {
  const clock = new THREE.Group()
  clock.name = TOWN_OBJECTS.clock.name
  clock.position.set(worldSize / 2 - 72, 0, -worldSize / 2 + 24)
  box(clock, [22, 5, 18], [0, 3, 0], "#697b64")
  box(clock, [7, 39, 7], [0, 23, 0], "#819077")
  box(clock, [30, 30, 10], [0, 48, 0], "#697b64")
  box(clock, [25, 25, 2], [0, 48, 6], "#f5efda")
  for (const [x, y] of [[0, 58], [0, 38], [-10, 48], [10, 48]]) box(clock, [2, 2, 1], [x!, y!, 7.5], "#65725d")
  const hand = (name: string, length: number) => {
    const pivot = new THREE.Group(); pivot.name = name; pivot.position.set(0, 48, 8)
    box(pivot, [2, length, 1], [0, length / 2, 0], "#394338"); clock.add(pivot)
  }
  hand("clockHour", 7); hand("clockMinute", 10)
  return clock
}
