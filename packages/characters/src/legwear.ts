import * as THREE from "three"

export const BOTTOMS = ["trousers", "shorts"] as const
export type Bottom = (typeof BOTTOMS)[number]
export const SHOE_STYLES = ["simple", "sneakers", "boots"] as const
export type ShoeStyle = (typeof SHOE_STYLES)[number]
export const DEFAULT_BOTTOM: Bottom = "trousers"
export const DEFAULT_SHOE_STYLE: ShoeStyle = "simple"
type Leg = { hip: THREE.Group; knee: THREE.Group }
type Materials = Record<"trousers" | "skin" | "shoes" | "eyes", THREE.Material>

export function createLegwear(bottom: Bottom, shoes: ShoeStyle, legs: readonly Leg[], materials: Materials) {
  const pieces: THREE.Mesh<THREE.BoxGeometry>[] = []
  function block(parent: THREE.Group, size: [number, number, number], at: [number, number, number], color: keyof Materials) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), materials[color])
    mesh.position.set(...at)
    mesh.castShadow = true
    mesh.receiveShadow = true
    parent.add(mesh)
    pieces.push(mesh)
  }
  for (const { hip, knee } of legs) {
    block(hip, [0.25, 0.37, 0.28], [0, -0.185, 0], "trousers")
    block(knee, [0.23, 0.37, 0.26], [0, -0.185, 0], bottom === "shorts" ? "skin" : "trousers")
    if (bottom === "shorts") block(hip, [0.275, 0.065, 0.3], [0, -0.325, 0], "trousers")
    block(knee, [0.27, 0.12, 0.42], [0, -0.43, 0.07], "shoes")
    if (shoes !== "simple") {
      block(knee, [0.28, 0.035, 0.43], [0, -0.4725, 0.07], "eyes")
      block(knee, [0.255, shoes === "boots" ? 0.2 : 0.09, 0.28], [0, shoes === "boots" ? -0.31 : -0.365, 0], "shoes")
      for (const z of [0.08, 0.135]) block(knee, [0.145, 0.016, 0.022], [0, -0.362, z], "eyes")
    }
  }
  return { dispose() { for (const piece of pieces) { piece.removeFromParent(); piece.geometry.dispose() } } }
}
