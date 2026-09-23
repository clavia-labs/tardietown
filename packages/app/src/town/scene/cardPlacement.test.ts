import { describe, expect, test } from "bun:test"
import { clampCard, placeCard, cardUpdate } from "./cardPlacement"
const bounds = { left: 12, top: 12, right: 1188, bottom: 788 }
const card = { width: 320, height: 280 }
const overlaps = (p: {x:number;y:number}, r: typeof bounds) => p.x < r.right && p.x + card.width > r.left && p.y < r.bottom && p.y + card.height > r.top

describe("scene card placement", () => {
  test("forum opens above the town at the right edge", () => {
    expect(placeCard({ x: 600, y: 500 }, card, bounds, "above-right")).toEqual({ x: 868, y: 196 })
  })
  test("keeps the start form and its submit action unobscured", () => {
    const form = { left: 500, right: 1100, top: 60, bottom: 380 }
    const result = placeCard({ x: 850, y: 450 }, card, bounds, "above-right", [form])
    expect(overlaps(result, form)).toBe(false)
  })
  test("opens new cards away from an existing card when room is available", () => {
    const existing = { left: 868, top: 196, right: 1188, bottom: 476 }
    expect(overlaps(placeCard({ x: 600, y: 500 }, card, bounds, "above-right", [existing]), existing)).toBe(false)
  })
  test("dragging clamps the whole card, not only its header", () => {
    expect(clampCard({ x: 2000, y: 2000 }, card, bounds)).toEqual({ x: 868, y: 508 })
    expect(clampCard({ x: -200, y: -100 }, card, bounds)).toEqual({ x: 12, y: 12 })
  })
  test("expanded cards fit a narrow viewport without negative coordinates", () => {
    const narrow = { left: 12, top: 12, right: 348, bottom: 628 }
    expect(clampCard({ x: 800, y: 600 }, { width: 336, height: 616 }, narrow)).toEqual({ x: 12, y: 12 })
  })
  test("clamping leaves an already valid user position unchanged", () => {
    expect(clampCard({ x: 80, y: 96 }, card, bounds)).toEqual({ x: 80, y: 96 })
  })
})

describe("card placement lifecycle", () => {
  const initial = { layout: "1200:800:320:280", expanded: "false" }
  test("anchors only once while scene objects or camera move", () => {
    expect(cardUpdate(undefined, initial, false)).toBe("anchor")
    expect(cardUpdate(initial, { ...initial }, false)).toBe("none")
  })
  test("content growth and viewport resize only clamp the current position", () => {
    expect(cardUpdate(initial, { ...initial, layout: "1200:800:320:400" }, false)).toBe("clamp")
    expect(cardUpdate(initial, { ...initial, layout: "600:800:320:280" }, false)).toBe("clamp")
  })
  test("expansion can reposition automatically, but respects a dragged card", () => {
    const expanded = { layout: "1200:800:800:640", expanded: "true" }
    expect(cardUpdate(initial, expanded, false)).toBe("anchor")
    expect(cardUpdate(initial, expanded, true)).toBe("clamp")
  })
})

// A crowded town must not trade a covered submit button for a clearer card.
test("reserved controls take priority over other open cards", () => {
  const available = { left: 0, top: 0, right: 640, bottom: 280 }
  const submit = { left: 620, top: 0, right: 640, bottom: 280 }
  const occupied = { left: 0, top: 0, right: 620, bottom: 280 }
  const result = placeCard({ x: 500, y: 400 }, card, available, "above-right", [submit], [occupied])
  expect(result.x + card.width).toBeLessThanOrEqual(submit.left)
})
