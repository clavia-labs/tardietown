import { DEFAULT_DUCK_PALETTE } from "./duckModel"

export const DUCK_PALETTES = [
  { name: "Lagoon", colors: DEFAULT_DUCK_PALETTE },
  {
    name: "Lilac",
    colors: {
      shell: "#b9a1d5",
      body: "#c4b0df",
      jaw: "#ead16a",
      feet: "#e3c35b",
      face: "#e5dfcd",
      eye: "#99d7dc",
      joints: "#aa9fbb",
      frame: "#454052"
    }
  },
  {
    name: "Moss",
    colors: {
      shell: "#a9bc8b",
      body: "#b7c69b",
      jaw: "#cf855b",
      feet: "#d89764",
      face: "#e2ddc5",
      eye: "#f1ca65",
      joints: "#919f83",
      frame: "#3c4b42"
    }
  },
  {
    name: "Coral",
    colors: {
      shell: "#dc9a87",
      body: "#e4ad98",
      jaw: "#6b969d",
      feet: "#78a5a7",
      face: "#eee0c9",
      eye: "#f3cd67",
      joints: "#b7978b",
      frame: "#4e4549"
    }
  },
  {
    name: "Lunar",
    colors: {
      shell: "#e0dfd4",
      body: "#d0d3cb",
      jaw: "#d3aa4c",
      feet: "#e4bc56",
      face: "#929f9e",
      eye: "#a2dbe1",
      joints: "#a0acaa",
      frame: "#38494f"
    }
  },
  {
    name: "Midnight",
    colors: {
      shell: "#536278",
      body: "#64768a",
      jaw: "#d58f53",
      feet: "#e0a464",
      face: "#9ba9ac",
      eye: "#b9ded6",
      joints: "#8a9ba8",
      frame: "#293743"
    }
  }
]

export function shuffleDuckPalettes(random = Math.random) {
  const palettes = [...DUCK_PALETTES]
  for (let i = palettes.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[palettes[i], palettes[j]] = [palettes[j]!, palettes[i]!]
  }
  return palettes
}
