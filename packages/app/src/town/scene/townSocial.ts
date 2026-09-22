import { cellKey, type Cell, type GridController } from "./gridController"

export const DEFAULT_SOCIAL_POLICY = {
  checkMs: 1500,
  minGroup: 2,
  maxGroup: 4,
  joinRadius: 7,
  gatherMs: 22000,
  chatMs: 14000,
  chatJitterMs: 10000,
  cooldownMs: 8000,
  cooldownJitterMs: 10000,
  scatterRadius: 5,
  maxNewGroups: 8,
  maxRoamers: 32,
  gestureMs: 3500
}
export type SocialPolicy = typeof DEFAULT_SOCIAL_POLICY
interface Gathering {
  center: Cell
  seats: Map<string, Cell>
  phase: "gathering" | "chatting"
  elapsed: number
  duration: number
}
const distance = (a: Cell, b: Cell) => Math.abs(a.x - b.x) + Math.abs(a.z - b.z)

export class TownSocial {
  readonly policy: SocialPolicy
  private readonly groups = new Set<Gathering>()
  private readonly membership = new Map<string, Gathering>()
  private readonly cooldown = new Map<string, number>()
  private elapsed = 0
  private untilCheck = 0
  constructor(readonly grid: GridController, policy: Partial<SocialPolicy> = {}, private readonly random = Math.random) {
    this.policy = { ...DEFAULT_SOCIAL_POLICY, ...policy }
    if (Object.values(this.policy).some((value) => !Number.isFinite(value) || value < 0) || this.policy.checkMs <= 0 || this.policy.gestureMs <= 0 || this.policy.minGroup < 2 || this.policy.maxGroup > 4 || this.policy.maxGroup < this.policy.minGroup || ![this.policy.minGroup, this.policy.maxGroup, this.policy.maxNewGroups, this.policy.maxRoamers, this.policy.scatterRadius].every(Number.isInteger)) throw new Error("Invalid social movement policy.")
  }
  snapshot() {
    return [...this.groups].map((group) => ({ phase: group.phase, members: [...group.seats.keys()], center: { ...group.center } }))
  }
  gesturing(id: string) {
    const group = this.membership.get(id)
    return group?.phase === "chatting" && [...group.seats.keys()][Math.floor(group.elapsed / this.policy.gestureMs) % group.seats.size] === id
  }
  facing(id: string) {
    const group = this.membership.get(id)
    const agent = this.grid.agents.get(id)
    if (!group || !agent || agent.next || cellKey(agent.cell) !== cellKey(group.seats.get(id)!)) return undefined
    return Math.atan2(group.center.x - agent.cell.x, group.center.z - agent.cell.z)
  }
  private free(cell: Cell) {
    return cell.x >= 0 && cell.z >= 0 && cell.x < this.grid.config.size && cell.z < this.grid.config.size && !this.grid.blocked.has(cellKey(cell))
  }
  advance(delta: number, paused: (id: string) => boolean = () => false) {
    this.elapsed += delta
    for (const group of this.groups) {
      if ([...group.seats.keys()].some(paused)) continue
      group.elapsed += delta
      if (group.phase === "gathering" && [...group.seats].every(([id, seat]) => {
        const agent = this.grid.agents.get(id)!
        return !agent.next && cellKey(agent.cell) === cellKey(seat)
      })) {
        group.phase = "chatting"
        group.elapsed = 0
        group.duration = this.policy.chatMs + this.random() * this.policy.chatJitterMs
      }
      if (group.elapsed >= group.duration) this.disperse(group)
    }
    this.untilCheck -= delta
    if (this.untilCheck > 0) return
    this.untilCheck = this.policy.checkMs
    const candidates = [...this.grid.agents.values()].filter((agent) => !this.membership.has(agent.id) && !paused(agent.id) && !agent.next && (this.cooldown.get(agent.id) ?? 0) <= this.elapsed)
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1))
      ;[candidates[i], candidates[j]] = [candidates[j]!, candidates[i]!]
    }
    const occupied = new Map([...this.grid.agents.values()].map((agent) => [cellKey(agent.cell), agent.id]))
    const claimed = new Set([...this.groups].flatMap((group) => [cellKey(group.center), ...[...group.seats.values()].map(cellKey)]))
    let formed = 0
    for (const seed of candidates) {
      if (formed >= this.policy.maxNewGroups) break
      if (this.membership.has(seed.id)) continue
      const centers = [{ x: seed.cell.x + 1, z: seed.cell.z }, { x: seed.cell.x - 1, z: seed.cell.z }, { x: seed.cell.x, z: seed.cell.z + 1 }, { x: seed.cell.x, z: seed.cell.z - 1 }]
      const center = centers.find((cell) => this.free(cell) && !occupied.has(cellKey(cell)) && !claimed.has(cellKey(cell)) && !this.grid.reservations.has(cellKey(cell)))
      if (!center) continue
      const seats = [{ x: center.x + 1, z: center.z }, { x: center.x - 1, z: center.z }, { x: center.x, z: center.z + 1 }, { x: center.x, z: center.z - 1 }].filter((seat) => this.free(seat) && !claimed.has(cellKey(seat)))
      const nearby = candidates.filter((agent) => !this.membership.has(agent.id) && distance(agent.cell, center) <= this.policy.joinRadius).sort((a, b) => distance(a.cell, center) - distance(b.cell, center))
      const group: Gathering = { center, seats: new Map(), phase: "gathering", elapsed: 0, duration: this.policy.gatherMs }
      for (const agent of nearby) {
        if (group.seats.size >= this.policy.maxGroup) break
        const choices = seats.filter((seat) => (!occupied.has(cellKey(seat)) || occupied.get(cellKey(seat)) === agent.id) && ![...group.seats.values()].some((used) => cellKey(used) === cellKey(seat))).sort((a,b) => distance(agent.cell,a)-distance(agent.cell,b))
        const seat = choices.find((seat) => this.grid.command(agent.id, seat))
        if (seat) group.seats.set(agent.id, seat)
      }
      if (group.seats.size < this.policy.minGroup) {
        group.seats.forEach((_, id) => this.grid.stop(id))
        this.cooldown.set(seed.id, this.elapsed + this.policy.checkMs)
        continue
      }
      this.groups.add(group)
      group.seats.forEach((seat, id) => { this.membership.set(id, group); claimed.add(cellKey(seat)) })
      claimed.add(cellKey(center))
      formed++
    }
    let roamers = 0
    for (const agent of candidates) {
      if (roamers >= this.policy.maxRoamers) break
      if (this.membership.has(agent.id) || agent.next) continue
      roamers++
      let nearby: (typeof candidates)[number] | undefined
      for (const other of candidates) {
        if (other.id !== agent.id && (!nearby || distance(agent.cell, other.cell) < distance(agent.cell, nearby.cell))) nearby = other
      }
      const directions = [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }]
      if (nearby) directions.sort((a,b) => distance({ x: agent.cell.x + a.x, z: agent.cell.z + a.z }, nearby.cell) - distance({ x: agent.cell.x + b.x, z: agent.cell.z + b.z }, nearby.cell))
      else directions.reverse()
      for (const direction of directions) {
        const target = { x: agent.cell.x + direction.x, z: agent.cell.z + direction.z }
        if (!claimed.has(cellKey(target)) && this.grid.command(agent.id, target)) break
      }
      this.cooldown.set(agent.id, this.elapsed + this.policy.checkMs)
    }
  }
  private disperse(group: Gathering) {
    this.groups.delete(group)
    for (const id of group.seats.keys()) {
      this.membership.delete(id)
      this.cooldown.set(id, this.elapsed + this.policy.cooldownMs + this.random() * this.policy.cooldownJitterMs)
      this.grid.stop(id)
      const agent = this.grid.agents.get(id)!
      const destinations: Cell[] = []
      for (let x = -this.policy.scatterRadius; x <= this.policy.scatterRadius; x++) for (let z = -this.policy.scatterRadius; z <= this.policy.scatterRadius; z++) {
        const cell = { x: agent.cell.x + x, z: agent.cell.z + z }
        if (this.free(cell) && distance(cell, agent.cell) <= this.policy.scatterRadius && distance(cell, group.center) > distance(agent.cell, group.center) + 1) destinations.push(cell)
      }
      while (destinations.length) {
        const [target] = destinations.splice(Math.floor(this.random() * destinations.length), 1)
        if (this.grid.command(id, target!)) break
      }
    }
  }
}
