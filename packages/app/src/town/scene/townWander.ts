import { TownSocial, type SocialPolicy } from "./townSocial"
import * as THREE from "three"
import {
  GridController,
  gridToWorld,
  cellKey,
  type Cell
} from "./gridController"
import {
  applyDuckPose,
  DEFAULT_DUCK_MOTION,
  NEUTRAL_DUCK_POSE,
  sampleGridFeet
} from "./duckRig"

export const DEFAULT_TOWN_WALK = {
  size: 10,
  cellSize: 32,
  moveMs: 2200,
  turnMs: 320,
  frameMs: 0
}
const motion = { ...DEFAULT_DUCK_MOTION, stride: 14 }
export const DEFAULT_TOWN_DENSITY = { minSize: 10, cellsPerResident: 4 }
export function townGridSize(count: number, policy = DEFAULT_TOWN_DENSITY) {
  return Math.max(policy.minSize, Math.ceil(Math.sqrt(count * policy.cellsPerResident + 14) / 2) * 2)
}
const blocked: Cell[] = [
  [1, 1],
  [1, 2],
  [2, 0],
  [2, 1],
  [1, 6],
  [2, 6],
  [1, 7],
  [2, 7],
  [0, 1],
  [0, 2],
  [0, 3],
  [4, 4],
  [5, 4],
  [4, 5],
  [5, 5],
  [8, 7],
  [8, 8]
].map(([x, z]) => ({ x: x!, z: z! }))

export function startTownWander(
  town: THREE.Group,
  render: () => void,
  enabled: () => boolean,
  animate?: (root: THREE.Object3D, sample: ReturnType<GridController["sample"]>, delta: number, moving: boolean) => void,
  config = DEFAULT_TOWN_WALK,
  paused: (id: string) => boolean = () => false,
  socialPolicy: Partial<SocialPolicy> = {}
) {
  const ducks = town.children.filter((object) => object.userData.residentId)
  const offset = (config.size - 10) / 2
  const obstacles = blocked.map((cell) => ({ x: cell.x + offset, z: cell.z + offset }))
  // Toolbox follows the outer corner as the town grows. Reserve its footprint
  // plus room for resident bodies, rather than translating it with central props.
  for (const x of [config.size - 2, config.size - 1])
    for (const z of [0, 1]) obstacles.push({ x, z })
  // The clock stands beside the toolbox along the back edge.
  for (const z of [0, 1]) obstacles.push({ x: config.size - 3, z })
  const free = Array.from({ length: config.size ** 2 }, (_, i) => ({
    x: i % config.size,
    z: Math.floor(i / config.size)
  })).filter(
    (cell) => !obstacles.some((obstacle) => cellKey(obstacle) === cellKey(cell))
  )
  const available = [...free]
  const starts = ducks.map((duck) => {
    let closest = 0
    let distance = Infinity
    available.forEach((cell, index) => {
      const point = gridToWorld(cell, config)
      const candidate = (point.x - duck.position.x) ** 2 + (point.z - duck.position.z) ** 2
      if (candidate < distance) { distance = candidate; closest = index }
    })
    return { id: duck.userData.residentId as string, cell: available.splice(closest, 1)[0]! }
  })
  const controller = new GridController(starts, obstacles, config)
  const social = new TownSocial(controller, socialPolicy)
  const reduced = matchMedia("(prefers-reduced-motion: reduce)")
  let frame = 0,
    previous = performance.now()
  const tick = (now: number) => {
    if (now - previous < config.frameMs) { frame = requestAnimationFrame(tick); return }
    const moving = enabled() && !reduced.matches && !document.hidden
    if (moving) {
      controller.advance(Math.max(0, Math.min(now - previous, 100)), paused)
      social.advance(Math.max(0, Math.min(now - previous, 100)), paused)
    }
    const delta = Math.max(0, Math.min(now - previous, 100)) / 1000
    previous = now
    for (const root of ducks) {
      const sample = controller.sample(root.userData.residentId)
      root.userData.socialTalking = social.gesturing(root.userData.residentId)
      root.position.set(sample.x, 1, sample.z)
      const facing = social.facing(root.userData.residentId)
      if (facing !== undefined && moving && !paused(root.userData.residentId)) {
        const agent = controller.agents.get(root.userData.residentId)!
        agent.heading += Math.atan2(Math.sin(facing - agent.heading), Math.cos(facing - agent.heading)) * (1 - Math.exp(-delta * 6))
        root.rotation.y = agent.heading
      } else root.rotation.y = sample.heading
      if (animate) {
        animate(root, sample, delta, moving && !paused(root.userData.residentId))
        continue
      }
      const duck = root.getObjectByName("rig") as THREE.Group
      const jaw = duck.getObjectByName("jaw")!
      const mouth = jaw.rotation.x
      applyDuckPose(
        duck,
        NEUTRAL_DUCK_POSE,
        motion,
        sample.walking
          ? sampleGridFeet(
              sample.progress,
              config.cellSize / root.scale.x,
              motion
            )
          : undefined
      )
      jaw.rotation.x = mouth
    }
    if (moving) render()
    frame = requestAnimationFrame(tick)
  }
  tick(previous + config.frameMs)
  render()
  return () => cancelAnimationFrame(frame)
}
