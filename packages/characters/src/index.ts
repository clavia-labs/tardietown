import * as THREE from "three"
import { createLegwear, DEFAULT_BOTTOM, DEFAULT_SHOE_STYLE, type Bottom, type ShoeStyle } from "./legwear"
export { BOTTOMS, SHOE_STYLES, DEFAULT_BOTTOM, DEFAULT_SHOE_STYLE, type Bottom, type ShoeStyle } from "./legwear"
import { createAccessories, DEFAULT_ACCESSORIES, type Accessories } from "./accessories"
export { ACCESSORIES, DEFAULT_ACCESSORIES, type Accessories, type Accessory } from "./accessories"
import { createOutfit, DEFAULT_OUTFIT, type Outfit } from "./outfit"
export { OUTFITS, DEFAULT_OUTFIT, type Outfit } from "./outfit"
import { createHair, DEFAULT_HAIRSTYLE, type Hairstyle } from "./hair"
export { HAIRSTYLES, DEFAULT_HAIRSTYLE, type Hairstyle } from "./hair"

export const DEFAULT_PALETTE = {
  skin: "#d9a17d", hair: "#493c35", shirt: "#83aaa4",
  trousers: "#45545e", shoes: "#efe3cf", eyes: "#303937"
}
export type Palette = typeof DEFAULT_PALETTE
export type Behavior = "idle" | "walk" | "think" | "talk"
export const DEFAULT_MOTION = { walkFrequency: 7, stride: 0.55, blendRate: 12 }
export type Motion = typeof DEFAULT_MOTION
export type CharacterOptions = { bottom?: Bottom; shoes?: ShoeStyle; accessories?: Partial<Accessories>; outfit?: Outfit; hairstyle?: Hairstyle; palette?: Partial<Palette>; scale?: number; motion?: Partial<Motion> }

export function createHuman(options: CharacterOptions = {}) {
  const palette = { ...DEFAULT_PALETTE, ...options.palette }
  const motion = { ...DEFAULT_MOTION, ...options.motion }
  const root = new THREE.Group()
  root.name = "human"
  root.scale.setScalar(options.scale ?? 1)
  const materials = Object.fromEntries(Object.entries(palette).map(([key, color]) => [key, new THREE.MeshStandardMaterial({ color, roughness: 0.9 })])) as Record<keyof Palette, THREE.MeshStandardMaterial>
  const geometries: THREE.BoxGeometry[] = []
  function box(parent: THREE.Group, size: [number, number, number], at: [number, number, number], color: keyof Palette) {
    const geometry = new THREE.BoxGeometry(...size)
    geometries.push(geometry)
    const mesh = new THREE.Mesh(geometry, materials[color])
    mesh.position.set(...at)
    mesh.castShadow = true
    mesh.receiveShadow = true
    parent.add(mesh)
    return mesh
  }
  function pivot(parent: THREE.Group, name: string, at: [number, number, number]) {
    const group = new THREE.Group()
    group.name = name
    group.position.set(...at)
    parent.add(group)
    return group
  }
  const body = pivot(root, "body", [0, 0.86, 0])
  box(body, [0.62, 0.65, 0.35], [0, 0.325, 0], "shirt")
  box(body, [0.24, 0.15, 0.23], [0, 0.7, 0], "skin")
  const head = pivot(body, "head", [0, 0.75, 0])
  box(head, [0.59, 0.57, 0.51], [0, 0.285, 0], "skin")
  let hairstyle = options.hairstyle ?? DEFAULT_HAIRSTYLE
  let hair = createHair(hairstyle, materials.hair)
  head.add(hair.root)
  for (const x of [-0.13, 0.13]) box(head, [0.055, 0.065, 0.018], [x, 0.31, 0.26], "eyes")
  const mouth = box(head, [0.1, 0.022, 0.018], [0, 0.16, 0.267], "eyes")
  const arms = [-1, 1].map((side) => {
    const shoulder = pivot(body, side < 0 ? "leftShoulder" : "rightShoulder", [side * 0.41, 0.57, 0])
    box(shoulder, [0.19, 0.3, 0.26], [0, -0.13, 0], "shirt")
    const elbow = pivot(shoulder, "elbow", [0, -0.29, 0])
    box(elbow, [0.17, 0.3, 0.2], [0, -0.13, 0], "skin")
    return { shoulder, elbow }
  })
  const legs = [-1, 1].map((side) => {
    const hip = pivot(body, side < 0 ? "leftHip" : "rightHip", [side * 0.17, 0, 0])
    const knee = pivot(hip, "knee", [0, -0.37, 0])
    return { hip, knee }
  })
  let bottom = options.bottom ?? DEFAULT_BOTTOM
  let shoes = options.shoes ?? DEFAULT_SHOE_STYLE
  let legwear = createLegwear(bottom, shoes, legs, materials)
  let outfit = options.outfit ?? DEFAULT_OUTFIT
  let clothing = createOutfit(outfit, { body, arms }, materials)
  let accessories = { ...DEFAULT_ACCESSORIES, ...options.accessories }
  let equipment = createAccessories(accessories, { head, body }, materials)
  hair.setCap(accessories.cap)
  let phase = 0
  let disposed = false
  const weights: Record<Behavior, number> = { idle: 1, walk: 0, think: 0, talk: 0 }
  return {
    root, joints: { body, head, arms, legs }, palette, motion,
    update(deltaSeconds: number, behavior: Behavior = "idle") {
      if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0 || disposed) return
      phase += deltaSeconds
      const blend = 1 - Math.exp(-motion.blendRate * deltaSeconds)
      for (const key of Object.keys(weights) as Behavior[]) weights[key] += ((key === behavior ? 1 : 0) - weights[key]) * blend
      const stride = Math.sin(phase * motion.walkFrequency) * motion.stride * weights.walk
      body.position.y = 0.86 + Math.abs(Math.sin(phase * motion.walkFrequency)) * 0.035 * weights.walk
      head.rotation.set(-0.12 * weights.think, Math.sin(phase * 1.5) * 0.12 * weights.talk, 0.15 * weights.think)
      arms.forEach(({ shoulder, elbow }, index) => {
        const gesture = Math.sin(phase * 3 + index * 1.7)
        shoulder.rotation.x = (index === 0 ? stride : -stride) - (index === 1 ? weights.think * 1.65 : 0) - weights.talk * (0.4 + gesture * 0.2)
        shoulder.rotation.z = (index === 0 ? -1 : 1) * (0.05 + weights.talk * 0.28) - (index === 1 ? weights.think * 0.25 : 0)
        elbow.rotation.x = (index === 1 ? -1.85 * weights.think : 0) - weights.talk * (0.45 + gesture * 0.15)
      })
      legs.forEach(({ hip, knee }, index) => {
        const swing = index === 0 ? -stride : stride
        hip.rotation.x = swing
        knee.rotation.x = Math.max(0, -swing) * 0.8
      })
      mouth.scale.y = 1 + weights.talk * (1 + Math.sin(phase * 12)) * 1.8
    },
    get bottom() { return bottom },
    get shoes() { return shoes },
    setLegwear(next: { bottom?: Bottom; shoes?: ShoeStyle }) {
      if (disposed) return
      legwear.dispose()
      bottom = next.bottom ?? bottom
      shoes = next.shoes ?? shoes
      legwear = createLegwear(bottom, shoes, legs, materials)
    },
    get accessories() { return { ...accessories } },
    setAccessories(next: Partial<Accessories>) {
      if (disposed) return
      equipment.dispose()
      accessories = { ...accessories, ...next }
      equipment = createAccessories(accessories, { head, body }, materials)
      hair.setCap(accessories.cap)
    },
    get outfit() { return outfit },
    setOutfit(next: Outfit) {
      if (disposed || next === outfit) return
      clothing.dispose()
      outfit = next
      clothing = createOutfit(next, { body, arms }, materials)
    },
    get hairstyle() { return hairstyle },
    setHairstyle(next: Hairstyle) {
      if (disposed || next === hairstyle) return
      hair.dispose()
      hairstyle = next
      hair = createHair(next, materials.hair)
      hair.setCap(accessories.cap)
      head.add(hair.root)
    },
    setPalette(next: Partial<Palette>) {
      for (const key of Object.keys(next) as (keyof Palette)[]) {
        const color = next[key]
        if (color !== undefined) { palette[key] = color; materials[key].color.set(color) }
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      legwear.dispose()
      equipment.dispose()
      clothing.dispose()
      hair.dispose()
      root.removeFromParent()
      geometries.forEach((geometry) => geometry.dispose())
      Object.values(materials).forEach((material) => material.dispose())
    }
  }
}
