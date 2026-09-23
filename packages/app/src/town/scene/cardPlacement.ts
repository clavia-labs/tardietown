/** Pure viewport geometry, shared by initial placement and dragging. */
export interface Point { x: number; y: number }
export interface Rect { left: number; top: number; right: number; bottom: number }
export interface Size { width: number; height: number }
export function clampCard(point: Point, size: Size, bounds: Rect): Point {
  return {
    x: Math.max(bounds.left, Math.min(point.x, Math.max(bounds.left, bounds.right - size.width))),
    y: Math.max(bounds.top, Math.min(point.y, Math.max(bounds.top, bounds.bottom - size.height)))
  }
}
function overlap(point: Point, size: Size, rect: Rect) {
  return Math.max(0, Math.min(point.x + size.width, rect.right) - Math.max(point.x, rect.left)) *
    Math.max(0, Math.min(point.y + size.height, rect.bottom) - Math.max(point.y, rect.top))
}
export function placeCard(anchor: Point, size: Size, bounds: Rect, preference: "above-right" | "beside", reserved: readonly Rect[] = [], occupied: readonly Rect[] = []): Point {
  const gap = 24
  const above = { x: bounds.right - size.width, y: anchor.y - size.height - gap }
  const right = { x: anchor.x + gap, y: anchor.y - size.height / 2 }
  const left = { x: anchor.x - size.width - gap, y: right.y }
  const candidates = preference === "above-right" ? [above, right, left] : [right, left, above]
  for (const rect of [...reserved, ...occupied]) candidates.push(
    { x: rect.right + gap, y: above.y }, { x: rect.left - size.width - gap, y: above.y },
    { x: above.x, y: rect.bottom + gap }, { x: above.x, y: rect.top - size.height - gap }
  )
  return candidates.map(point => clampCard(point, size, bounds)).reduce((best, point) => {
    const score = (p: Point, rects: readonly Rect[]) => rects.reduce((sum, rect) => sum + overlap(p, size, rect), 0)
    const reservedDifference = score(point, reserved) - score(best, reserved)
    // Forms and navigation take precedence over reducing overlap with other cards.
    return reservedDifference < 0 || (reservedDifference === 0 && score(point, occupied) < score(best, occupied)) ? point : best
  })
}

export interface CardLayout { layout: string; expanded: string | undefined }
export function cardUpdate(previous: CardLayout | undefined, next: CardLayout, dragged: boolean): "none" | "clamp" | "anchor" {
  if (!previous) return "anchor"
  if (previous.layout === next.layout && previous.expanded === next.expanded) return "none"
  return dragged || previous.expanded === next.expanded ? "clamp" : "anchor"
}
