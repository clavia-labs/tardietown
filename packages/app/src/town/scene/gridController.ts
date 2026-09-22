export interface Cell {
  x: number
  z: number
}
export const DEFAULT_GRID_CONFIG = {
  size: 8,
  cellSize: 32,
  moveMs: 1400,
  turnMs: 180
}
export type GridConfig = typeof DEFAULT_GRID_CONFIG
export const cellKey = (cell: Cell) => `${cell.x},${cell.z}`
const sameCell = (a: Cell, b: Cell) => a.x === b.x && a.z === b.z

export function gridToWorld(cell: Cell, config = DEFAULT_GRID_CONFIG) {
  return {
    x: (cell.x - (config.size - 1) / 2) * config.cellSize,
    z: (cell.z - (config.size - 1) / 2) * config.cellSize
  }
}

export function findGridPath(
  start: Cell,
  goal: Cell,
  blocked: ReadonlySet<string>,
  size: number
): Cell[] | null {
  const valid = (cell: Cell) =>
    Number.isInteger(cell.x) &&
    Number.isInteger(cell.z) &&
    cell.x >= 0 &&
    cell.z >= 0 &&
    cell.x < size &&
    cell.z < size
  if (!valid(start) || !valid(goal) || blocked.has(cellKey(goal))) return null
  const queue = [start]
  const parents = new Map<string, Cell | null>([[cellKey(start), null]])
  for (let i = 0; i < queue.length; i++) {
    const cell = queue[i]!
    if (sameCell(cell, goal)) {
      const path: Cell[] = []
      let cursor: Cell | null = cell
      while (cursor && !sameCell(cursor, start)) {
        path.push(cursor)
        cursor = parents.get(cellKey(cursor)) ?? null
      }
      return path.reverse()
    }
    for (const [dx, dz] of [
      [0, 1],
      [1, 0],
      [0, -1],
      [-1, 0]
    ] as const) {
      const next = { x: cell.x + dx, z: cell.z + dz }
      const key = cellKey(next)
      if (valid(next) && !blocked.has(key) && !parents.has(key)) {
        parents.set(key, cell)
        queue.push(next)
      }
    }
  }
  return null
}

export interface GridAgent {
  id: string
  cell: Cell
  goal: Cell | null
  next: Cell | null
  route: Cell[]
  heading: number
  fromHeading: number
  toHeading: number
  phase: "idle" | "turning" | "walking" | "waiting"
  elapsed: number
}

export class GridController {
  readonly config: GridConfig
  readonly agents = new Map<string, GridAgent>()
  readonly blocked: Set<string>
  readonly reservations = new Map<string, string>()

  constructor(
    starts: readonly { id: string; cell: Cell }[],
    blocked: readonly Cell[] = [],
    config: GridConfig = DEFAULT_GRID_CONFIG
  ) {
    if (
      !Number.isInteger(config.size) ||
      config.size < 1 ||
      ![config.cellSize, config.moveMs, config.turnMs].every(
        (value) => Number.isFinite(value) && value > 0
      )
    )
      throw new RangeError("Grid size and timings must be positive.")
    this.config = { ...config }
    this.blocked = new Set(blocked.map(cellKey))
    const occupied = new Set<string>()
    for (const start of starts) {
      if (
        this.agents.has(start.id) ||
        occupied.has(cellKey(start.cell)) ||
        !findGridPath(start.cell, start.cell, this.blocked, config.size)
      )
        throw new Error(
          "Agent starts must be unique, free cells inside the grid."
        )
      occupied.add(cellKey(start.cell))
      this.agents.set(start.id, {
        id: start.id,
        cell: { ...start.cell },
        goal: null,
        next: null,
        route: [],
        heading: 0,
        fromHeading: 0,
        toHeading: 0,
        phase: "idle",
        elapsed: 0
      })
    }
  }

  private unavailable(id: string) {
    const cells = new Set(this.blocked)
    for (const agent of this.agents.values())
      if (agent.id !== id) cells.add(cellKey(agent.cell))
    for (const [cell, owner] of this.reservations)
      if (owner !== id) cells.add(cell)
    return cells
  }

  command(id: string, goal: Cell) {
    const agent = this.agents.get(id)
    if (!agent) return false
    const route = findGridPath(
      agent.next ?? agent.cell,
      goal,
      this.unavailable(id),
      this.config.size
    )
    if (!route) return false
    agent.goal = { ...goal }
    agent.route = route
    if (!agent.next) this.plan(agent)
    return true
  }

  stop(id: string) {
    const agent = this.agents.get(id)
    if (!agent) return
    agent.goal = null
    agent.route = []
    if (!agent.next) agent.phase = "idle"
  }

  toggleBlock(cell: Cell) {
    if (
      !Number.isInteger(cell.x) ||
      !Number.isInteger(cell.z) ||
      cell.x < 0 ||
      cell.z < 0 ||
      cell.x >= this.config.size ||
      cell.z >= this.config.size
    )
      return false
    const key = cellKey(cell)
    if (
      this.reservations.has(key) ||
      [...this.agents.values()].some((agent) => sameCell(agent.cell, cell))
    )
      return false
    if (this.blocked.has(key)) this.blocked.delete(key)
    else this.blocked.add(key)
    return true
  }

  private plan(agent: GridAgent) {
    if (!agent.goal || sameCell(agent.cell, agent.goal)) {
      agent.goal = null
      agent.phase = "idle"
      agent.route = []
      return
    }
    const route = findGridPath(
      agent.cell,
      agent.goal,
      this.unavailable(agent.id),
      this.config.size
    )
    if (!route?.length) {
      agent.phase = "waiting"
      agent.route = []
      return
    }
    agent.route = route
    agent.next = route[0]!
    this.reservations.set(cellKey(agent.next), agent.id)
    const target = Math.atan2(
      agent.next.x - agent.cell.x,
      agent.next.z - agent.cell.z
    )
    agent.fromHeading = agent.heading
    agent.toHeading =
      agent.heading +
      Math.atan2(
        Math.sin(target - agent.heading),
        Math.cos(target - agent.heading)
      )
    agent.elapsed = 0
    agent.phase =
      Math.abs(agent.toHeading - agent.heading) > 1e-8 ? "turning" : "walking"
  }

  advance(deltaMs: number, paused: (id: string) => boolean = () => false) {
    if (!Number.isFinite(deltaMs) || deltaMs < 0)
      throw new RangeError("Elapsed time must be finite and nonnegative.")
    for (const agent of this.agents.values()) {
      if (paused(agent.id)) continue
      if (!agent.next) this.plan(agent)
      let remaining = deltaMs
      while (agent.next && remaining > 0) {
        const duration =
          agent.phase === "turning" ? this.config.turnMs : this.config.moveMs
        const step = Math.min(remaining, duration - agent.elapsed)
        agent.elapsed += step
        remaining -= step
        if (agent.phase === "turning") {
          const progress = agent.elapsed / duration
          agent.heading =
            agent.fromHeading +
            (agent.toHeading - agent.fromHeading) *
              (progress * progress * (3 - 2 * progress))
        }
        if (agent.elapsed < duration) break
        agent.elapsed = 0
        if (agent.phase === "turning") {
          agent.heading = agent.toHeading
          agent.phase = "walking"
        } else {
          this.reservations.delete(cellKey(agent.next))
          agent.cell = agent.next
          agent.next = null
          this.plan(agent)
        }
      }
    }
  }

  sample(id: string) {
    const agent = this.agents.get(id)
    if (!agent) throw new Error("Unknown grid agent.")
    const from = gridToWorld(agent.cell, this.config)
    const to = gridToWorld(agent.next ?? agent.cell, this.config)
    const progress =
      agent.phase === "walking" ? agent.elapsed / this.config.moveMs : 0
    return {
      x: from.x + (to.x - from.x) * progress,
      z: from.z + (to.z - from.z) * progress,
      heading: agent.heading,
      progress,
      walking: agent.phase === "walking"
    }
  }
}
