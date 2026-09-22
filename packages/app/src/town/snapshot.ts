import type { ColonySnapshot } from "./protocol"

export function reconcileColonySnapshot(previous: ColonySnapshot | undefined, next: ColonySnapshot): ColonySnapshot {
  if (!previous || previous.id !== next.id) return next
  return {
    ...next,
    residents: JSON.stringify(previous.residents) === JSON.stringify(next.residents) ? previous.residents : next.residents,
    palettes: JSON.stringify(previous.palettes) === JSON.stringify(next.palettes) ? previous.palettes : next.palettes
  }
}
