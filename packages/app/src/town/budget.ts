export interface SpendState {
  limitUsd: number
  spentUsd: number
  reservedUsd: number
  remainingUsd: number
  estimated: boolean
  unavailable: boolean
}
export const validBudget = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0.01 && value <= 100 && Math.abs(value * 100 - Math.round(value * 100)) < 1e-8

// Reservations prevent parallel turns from being allocated the same money.
// Provider costs arrive after a request finishes, so this is a soft spending cap.
export class TownBudget {
  private limit: number
  private readonly reservations = new Map<string, number>()
  private readonly costs = new Map<string, { usd: number; estimated: boolean; unavailable: boolean }>()
  private readonly grants = new Map<string, number>()
  restoreHistory(limit: number, grants: ReadonlyMap<string, number>) {
    if (!validBudget(limit)) throw Error("Invalid saved budget.")
    this.limit = limit
    this.grants.clear(); for (const [id, amount] of grants) this.grants.set(id, amount)
    this.reservations.clear()
  }
  constructor(limit: number, private readonly changed: () => void = () => {}) {
    if (!validBudget(limit)) throw new Error("Budget must be $0.01–$100 in whole cents.")
    this.limit = limit
  }
  snapshot = (): SpendState => {
    const values = [...this.costs.values()]
    const spentUsd = values.reduce((sum, value) => sum + value.usd, 0)
    return { limitUsd: this.limit, spentUsd, reservedUsd: [...this.reservations.values()].reduce((a, b) => a + b, 0), remainingUsd: Math.max(0, this.limit - spentUsd), estimated: values.some(value => value.estimated), unavailable: values.some(value => value.unavailable) }
  }
  available = () => { const s = this.snapshot(); return s.unavailable ? 0 : Math.max(0, s.remainingUsd - s.reservedUsd) }
  reserve(id: string) {
    if (this.reservations.has(id)) throw new Error("Resident already has a budget reservation.")
    const amount = Math.min(0.25, this.available())
    if (amount < 0.000001) throw new Error("Town budget exhausted.")
    this.reservations.set(id, amount); this.changed(); return amount
  }
  settle(id: string, cost: { usd: number; estimated: boolean; unavailable: boolean }) {
    if (!Number.isFinite(cost.usd) || cost.usd < 0) throw new Error("Invalid model cost.")
    const previous = this.costs.get(id)
    this.costs.set(id, { ...cost, usd: Math.max(previous?.usd ?? 0, cost.usd) }); this.reservations.delete(id); this.changed()
  }
  add(amount: number, operationId: string) {
    if (!validBudget(amount) || !operationId || operationId.length > 100) throw new Error("Invalid budget addition.")
    if (this.grants.has(operationId)) {
      if (this.grants.get(operationId) !== amount) throw new Error("Budget operation already used.")
      return
    }
    if (this.limit + amount > 100) throw new Error("Town budget cannot exceed $100.")
    this.grants.set(operationId, amount); this.limit += amount; this.changed()
  }
}
