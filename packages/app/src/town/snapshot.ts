import type { TownSnapshot } from "./protocol"

export function reconcileTownSnapshot(previous: TownSnapshot | undefined, next: TownSnapshot): TownSnapshot {
  if (!previous || previous.id !== next.id) return next
  return {
    ...next,
    residents: JSON.stringify(previous.residents) === JSON.stringify(next.residents) ? previous.residents : next.residents,
    palettes: JSON.stringify(previous.palettes) === JSON.stringify(next.palettes) ? previous.palettes : next.palettes
  }
}
