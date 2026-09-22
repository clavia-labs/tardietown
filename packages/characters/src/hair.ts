import * as THREE from "three"

export const HAIRSTYLES = ["cropped", "side-part", "curls", "bob", "shoulder-length", "ponytail", "bun", "bald"] as const
export type Hairstyle = (typeof HAIRSTYLES)[number]
export const DEFAULT_HAIRSTYLE: Hairstyle = "cropped"

export function createHair(style: Hairstyle, material: THREE.Material) {
  const root = new THREE.Group()
  root.name = `hair:${style}`
  const geometries: THREE.BoxGeometry[] = []
  const pieces: { mesh: THREE.Mesh<THREE.BoxGeometry>; positions: Float32Array; capOffset?: THREE.Vector3 }[] = []
  let capOffset: THREE.Vector3 | undefined
  function block(size: [number, number, number], position: [number, number, number], tilt = 0) {
    const geometry = new THREE.BoxGeometry(...size)
    geometries.push(geometry)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(...position)
    mesh.rotation.z = tilt
    mesh.castShadow = true
    mesh.receiveShadow = true
    root.add(mesh)
    pieces.push({ mesh, positions: new Float32Array(geometry.attributes.position!.array), ...(capOffset ? { capOffset: capOffset.clone() } : {}) })
  }
  if (style !== "bald") {
    block([0.62, 0.12, 0.54], [0, 0.55, 0])
    block([0.62, 0.34, 0.12], [0, 0.34, -0.23])
  }
  if (style === "cropped" || style === "side-part") {
    for (const side of [-1, 1]) {
      block([0.07, 0.24, 0.49], [side * 0.295, 0.43, -0.025])
      block([0.07, 0.12, 0.12], [side * 0.295, 0.28, -0.17])
    }
  }
  if (style === "side-part") {
    block([0.43, 0.16, 0.57], [-0.11, 0.63, 0.015], -0.1)
    block([0.17, 0.09, 0.55], [0.235, 0.585, 0])
    block([0.23, 0.15, 0.1], [-0.2, 0.47, 0.24], -0.1)
  }
  if (style === "curls") {
    for (let x = 0; x < 5; x++) {
      for (let z = 0; z < 4; z++) {
        const px = (x - 2) * 0.135
        const pz = (z - 1.5) * 0.14
        const variation = ((x * 3 + z * 7) % 5) / 5
        const y = 0.61 + variation * 0.045
        block([0.155, 0.135, 0.16], [px, y, pz], (variation - 0.5) * 0.16)
        block([0.075, 0.07, 0.08], [px + (x % 2 ? 0.022 : -0.018), y + 0.085, pz + (z % 2 ? 0.025 : -0.02)])
      }
    }
    for (let x = 0; x < 5; x++) {
      const px = (x - 2) * 0.135
      const y = 0.52 + (x % 2) * 0.025
      block([0.145, 0.13, 0.12], [px, y, 0.265], (x % 2 ? 1 : -1) * 0.06)
      block([0.075, 0.07, 0.065], [px + (x % 2 ? 0.02 : -0.02), y - 0.005, 0.34])
    }
    for (let x = 0; x < 5; x++) {
      for (let row = 0; row < 3; row++) {
        const px = (x - 2) * 0.135
        const y = 0.26 + row * 0.13 + (x % 2) * 0.02
        block([0.145, 0.145, 0.12], [px, y, -0.265], ((x + row) % 2 ? 1 : -1) * 0.06)
        block([0.075, 0.07, 0.065], [px + (row % 2 ? 0.02 : -0.02), y + 0.015, -0.34])
      }
    }
    for (const side of [-1, 1]) {
      for (let z = 0; z < 3; z++) {
        const pz = (z - 1) * 0.15
        const y = 0.45 + (z % 2) * 0.035
        block([0.12, 0.15, 0.17], [side * 0.3, y, pz])
        block([0.06, 0.075, 0.085], [side * 0.375, y + 0.025, pz + 0.025])
      }
    }
  }
  if (style === "bob") {
    block([0.66, 0.55, 0.16], [0, 0.29, -0.25])
    for (const side of [-1, 1]) block([0.12, 0.48, 0.53], [side * 0.3, 0.3, 0], side * -0.025)
    block([0.59, 0.15, 0.1], [0, 0.485, 0.255])
  }
  if (style === "shoulder-length") {
    block([0.65, 0.68, 0.17], [0, 0.22, -0.27])
    for (const side of [-1, 1]) {
      block([0.13, 0.55, 0.4], [side * 0.3, 0.27, -0.055], side * -0.035)
      block([0.15, 0.24, 0.32], [side * 0.32, -0.055, -0.06], side * 0.07)
    }
    block([0.34, 0.12, 0.12], [-0.135, 0.49, 0.25], -0.16)
    block([0.22, 0.1, 0.1], [0.195, 0.52, 0.245], 0.12)
  }
  if (style === "ponytail" || style === "bun") {
    for (const side of [-1, 1]) block([0.08, 0.28, 0.42], [side * 0.29, 0.415, -0.055])
    block([0.35, 0.1, 0.12], [-0.13, 0.515, 0.23], -0.1)
    block([0.17, 0.16, 0.17], [0, 0.5, -0.335])
  }
  if (style === "ponytail") {
    capOffset = new THREE.Vector3(0, 0, 0)
    block([0.24, 0.23, 0.25], [0, 0.46, -0.45])
    block([0.21, 0.3, 0.23], [0.025, 0.22, -0.49], 0.08)
    block([0.16, 0.25, 0.19], [0.055, -0.035, -0.46], 0.12)
  }
  if (style === "bun") {
    capOffset = new THREE.Vector3(0, -0.32, -0.1)
    block([0.29, 0.28, 0.28], [0, 0.63, -0.35])
    block([0.22, 0.1, 0.2], [0, 0.8, -0.35])
    block([0.14, 0.15, 0.08], [0.02, 0.63, -0.51])
  }
  return {
    root,
    setCap(enabled: boolean) {
      for (const { mesh, positions, capOffset } of pieces) {
        const attribute = mesh.geometry.attributes.position!
        const point = new THREE.Vector3()
        mesh.visible = true
        let belowBand = false
        for (let index = 0; index < attribute.count; index++) {
          point.fromArray(positions, index * 3)
          if (enabled) {
            if (capOffset) point.add(capOffset.clone().applyQuaternion(mesh.quaternion.clone().invert()))
            else {
              point.applyQuaternion(mesh.quaternion).add(mesh.position)
              if (point.y < 0.475) belowBand = true
              point.y = Math.min(point.y, 0.475)
              point.sub(mesh.position).applyQuaternion(mesh.quaternion.clone().invert())
            }
          }
          attribute.setXYZ(index, point.x, point.y, point.z)
        }
        mesh.visible = !enabled || capOffset !== undefined || belowBand
        attribute.needsUpdate = true
        mesh.geometry.computeVertexNormals()
        mesh.geometry.computeBoundingBox()
        mesh.geometry.computeBoundingSphere()
      }
    },
    dispose() {
      root.removeFromParent()
      geometries.forEach((geometry) => geometry.dispose())
    }
  }
}
