import * as THREE from "three"

export const OUTFITS = ["t-shirt", "sweater", "jacket", "overalls"] as const
export type Outfit = (typeof OUTFITS)[number]
export const DEFAULT_OUTFIT: Outfit = "t-shirt"

type OutfitRig = { body: THREE.Group; arms: readonly { shoulder: THREE.Group; elbow: THREE.Group }[] }
type OutfitMaterials = Record<"shirt" | "trousers" | "shoes", THREE.Material>

export function createOutfit(style: Outfit, rig: OutfitRig, materials: OutfitMaterials) {
  const pieces: THREE.Mesh<THREE.BoxGeometry>[] = []
  function block(parent: THREE.Group, size: [number, number, number], at: [number, number, number], color: keyof OutfitMaterials, tilt = 0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), materials[color])
    mesh.name = `outfit:${style}`
    mesh.position.set(...at)
    mesh.rotation.z = tilt
    mesh.castShadow = true
    mesh.receiveShadow = true
    parent.add(mesh)
    pieces.push(mesh)
  }
  if (style === "sweater" || style === "jacket") {
    for (const { shoulder, elbow } of rig.arms) {
      block(shoulder, [0.205, 0.32, 0.275], [0, -0.13, 0], "shirt")
      block(elbow, [0.19, 0.21, 0.235], [0, -0.085, 0], "shirt")
      block(elbow, [0.2, 0.05, 0.245], [0, -0.19, 0], "shirt")
    }
  }
  if (style === "sweater") {
    block(rig.body, [0.65, 0.65, 0.39], [0, 0.325, 0], "shirt")
    block(rig.body, [0.66, 0.065, 0.4], [0, 0.045, 0], "shirt")
    block(rig.body, [0.29, 0.09, 0.275], [0, 0.66, 0], "shirt")
    block(rig.body, [0.654, 0.075, 0.018], [0, 0.38, 0.203], "shoes")
    block(rig.body, [0.654, 0.075, 0.018], [0, 0.23, 0.203], "shoes")
  }
  if (style === "jacket") {
    block(rig.body, [0.23, 0.6, 0.025], [0, 0.325, 0.183], "shoes")
    block(rig.body, [0.66, 0.67, 0.04], [0, 0.315, -0.19], "shirt")
    for (const side of [-1, 1]) {
      block(rig.body, [0.215, 0.67, 0.08], [side * 0.225, 0.315, 0.19], "shirt")
      block(rig.body, [0.08, 0.19, 0.045], [side * 0.115, 0.56, 0.235], "shirt", side * -0.25)
      block(rig.body, [0.145, 0.11, 0.035], [side * 0.225, 0.17, 0.245], "shirt")
      block(rig.body, [0.12, 0.018, 0.014], [side * 0.225, 0.215, 0.267], "shoes")
    }
  }
  if (style === "overalls") {
    block(rig.body, [0.63, 0.16, 0.37], [0, 0.08, 0], "trousers")
    block(rig.body, [0.41, 0.32, 0.035], [0, 0.29, 0.19], "trousers")
    block(rig.body, [0.25, 0.14, 0.025], [0, 0.31, 0.22], "trousers")
    block(rig.body, [0.21, 0.016, 0.013], [0, 0.373, 0.239], "shoes")
    for (const side of [-1, 1]) {
      block(rig.body, [0.075, 0.29, 0.025], [side * 0.17, 0.52, 0.19], "trousers")
      block(rig.body, [0.075, 0.035, 0.39], [side * 0.17, 0.65, 0], "trousers")
      block(rig.body, [0.075, 0.51, 0.025], [side * 0.17, 0.405, -0.19], "trousers")
      block(rig.body, [0.035, 0.035, 0.015], [side * 0.17, 0.435, 0.217], "shoes")
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
