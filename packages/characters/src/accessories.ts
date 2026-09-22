import * as THREE from "three"

export const ACCESSORIES = ["glasses", "cap", "backpack"] as const
export type Accessory = (typeof ACCESSORIES)[number]
export type Accessories = Record<Accessory, boolean>
export const DEFAULT_ACCESSORIES: Accessories = { glasses: false, cap: false, backpack: false }

type AccessoryMaterials = Record<"eyes" | "shirt" | "trousers" | "shoes" | "hair", THREE.Material>
export function createAccessories(selected: Accessories, rig: { head: THREE.Group; body: THREE.Group }, materials: AccessoryMaterials) {
  const pieces: THREE.Mesh<THREE.BoxGeometry>[] = []
  function block(parent: THREE.Group, size: [number, number, number], at: [number, number, number], color: keyof AccessoryMaterials) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), materials[color])
    mesh.position.set(...at)
    mesh.castShadow = true
    mesh.receiveShadow = true
    parent.add(mesh)
    pieces.push(mesh)
  }
  if (selected.glasses) {
    for (const side of [-1, 1]) {
      const x = side * 0.13
      for (const y of [0.245, 0.375]) block(rig.head, [0.18, 0.022, 0.025], [x, y, 0.29], "eyes")
      for (const edge of [-1, 1]) block(rig.head, [0.022, 0.13, 0.025], [x + edge * 0.079, 0.31, 0.29], "eyes")
      block(rig.head, [0.085, 0.022, 0.025], [side * 0.258, 0.33, 0.29], "eyes")
      block(rig.head, [0.022, 0.022, 0.33], [side * 0.302, 0.33, 0.135], "eyes")
    }
    block(rig.head, [0.09, 0.022, 0.025], [0, 0.325, 0.29], "eyes")
  }
  if (selected.cap) {
    block(rig.head, [0.66, 0.2, 0.58], [0, 0.57, 0], "shirt")
    block(rig.head, [0.68, 0.045, 0.6], [0, 0.48, 0], "trousers")
    block(rig.head, [0.68, 0.04, 0.29], [0, 0.47, 0.395], "shirt")
    block(rig.head, [0.11, 0.07, 0.018], [0, 0.57, 0.299], "shoes")
  }
  if (selected.backpack) {
    block(rig.body, [0.48, 0.52, 0.22], [0, 0.33, -0.3], "trousers")
    block(rig.body, [0.34, 0.22, 0.07], [0, 0.22, -0.445], "shirt")
    block(rig.body, [0.3, 0.022, 0.015], [0, 0.31, -0.488], "shoes")
    for (const side of [-1, 1]) {
      block(rig.body, [0.055, 0.6, 0.035], [side * 0.235, 0.35, 0.25], "trousers")
      block(rig.body, [0.055, 0.035, 0.48], [side * 0.235, 0.66, 0.02], "trousers")
      block(rig.body, [0.065, 0.045, 0.015], [side * 0.235, 0.19, 0.275], "shoes")
    }
  }
  return {
    dispose() {
      for (const piece of pieces) {
        piece.removeFromParent()
        piece.geometry.dispose()
      }
    }
  }
}
