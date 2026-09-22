import * as THREE from "three"
import { registerDuckRig, type DuckLegRig } from "./duckRig"

export const DEFAULT_DUCK_PALETTE = {
  shell: "#a0d5db",
  body: "#99d3db",
  jaw: "#ed792b",
  feet: "#f39a37",
  face: "#a7b0a6",
  eye: "#f4bd2e",
  joints: "#96b6b8",
  frame: "#394f56"
}

export type DuckPalette = typeof DEFAULT_DUCK_PALETTE

function material(color: string) {
  const result = new THREE.MeshStandardMaterial({ color, roughness: 0.85 })
  result.userData.baseColor = color
  return result
}

export function applyDuckPalette(model: THREE.Group, palette: DuckPalette) {
  const colors = new Map(
    Object.entries(DEFAULT_DUCK_PALETTE).map(([key, color]) => [
      color,
      palette[key as keyof DuckPalette]
    ])
  )
  colors.set("#46606a", palette.frame)
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material]
    for (const material of materials) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue
      const color = material.userData.identification
        ? palette.jaw
        : colors.get(material.userData.baseColor)
      if (color) material.color.set(color)
      if (material.userData.baseColor === "#c48b1d")
        material.color.set(palette.eye).multiplyScalar(0.65)
    }
  })
}

export function box(
  parent: THREE.Object3D,
  size: readonly [number, number, number],
  position: readonly [number, number, number],
  color: string
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material(color))
  mesh.position.set(...position)
  parent.add(mesh)
  return mesh
}

function cylinder(
  parent: THREE.Object3D,
  from: THREE.Vector3,
  to: THREE.Vector3,
  radius: number,
  color: string
) {
  const direction = to.clone().sub(from)
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, direction.length(), 32),
    material(color)
  )
  mesh.position.copy(from).add(to).multiplyScalar(0.5)
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.normalize()
  )
  parent.add(mesh)
  return mesh
}

function hood(width: number, height: number, depth: number, color: string) {
  const half = width / 2
  const shape = new THREE.Shape()
  shape.moveTo(-half, 0)
  shape.lineTo(half, 0)
  shape.lineTo(half, height * 0.47)
  shape.bezierCurveTo(half, height * 0.9, half * 0.7, height, 0, height)
  shape.bezierCurveTo(
    -half * 0.7,
    height,
    -half,
    height * 0.9,
    -half,
    height * 0.47
  )
  shape.closePath()
  return new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: false,
      curveSegments: 24
    }),
    material(color)
  )
}

export const DEFAULT_HEAD_DEPTH = 42

export function createDuck(color: string, headDepth = DEFAULT_HEAD_DEPTH) {
  const headFront = headDepth / 2
  const duck = new THREE.Group()
  duck.name = "duck"
  const footHeight = 4
  const torsoBottom = 43
  const torsoTop = 61
  const jawBottom = 94
  const jawHeight = 5
  const hingeHeight = jawBottom + jawHeight
  const seam = 1.2
  const chassis = new THREE.Group()
  chassis.position.z = -headFront - 4
  duck.add(chassis)
  duck.position.z = (headFront + 4) / 2
  const legs: DuckLegRig[] = []
  for (const x of [-13, 13]) {
    const hip = new THREE.Vector3(x, torsoBottom - 1, 0)
    const knee = new THREE.Vector3(x, 23, 8)
    const ankle = new THREE.Vector3(x, footHeight / 2, 0)
    const foot = box(
      chassis,
      [16, footHeight, 22],
      [x, footHeight / 2, 4],
      "#f39a37"
    )
    const upper = cylinder(chassis, hip, knee, 3.8, "#46606a")
    const lower = cylinder(chassis, knee, ankle, 3.5, "#46606a")
    const joint = (point: THREE.Vector3, radius: number) =>
      cylinder(
        chassis,
        point.clone().add(new THREE.Vector3(-5, 0, 0)),
        point.clone().add(new THREE.Vector3(5, 0, 0)),
        radius,
        "#96b6b8"
      )
    legs.push({
      hip,
      ankle,
      upperLength: hip.distanceTo(knee),
      lowerLength: knee.distanceTo(ankle),
      upper,
      lower,
      hipJoint: joint(hip, 6),
      kneeJoint: joint(knee, 5.5),
      foot
    })
  }
  const torso = box(
    chassis,
    [41, torsoTop - torsoBottom, 20],
    [0, (torsoBottom + torsoTop) / 2, 0],
    "#99d3db"
  )
  const badge = box(chassis, [6, 6, 0.4], [11, 52, 10.2], color)
  badge.material.userData.identification = true
  const neck = box(
    chassis,
    [8, hingeHeight - torsoTop, 8],
    [0, (torsoTop + hingeHeight) / 2, 0],
    "#394f56"
  )
  cylinder(
    duck,
    new THREE.Vector3(-7, hingeHeight, -headFront),
    new THREE.Vector3(7, hingeHeight, -headFront),
    2.5,
    "#96b6b8"
  )
  const jaw = new THREE.Group()
  jaw.name = "jaw"
  jaw.position.set(0, jawBottom + jawHeight, -headFront)
  duck.add(jaw)
  box(
    jaw,
    [56, jawHeight, headDepth],
    [0, -jawHeight / 2, headFront],
    "#ed792b"
  )
  box(jaw, [56, 1, headDepth], [0, 0, headFront], "#354d52")
  const shell = hood(56, 34, headDepth, "#a0d5db")
  shell.position.set(0, hingeHeight + seam, -headFront)
  duck.add(shell)
  const rim = hood(48, 29, 0.5, "#52696a")
  rim.position.set(0, shell.position.y + 2, headFront + 0.05)
  duck.add(rim)
  const face = hood(44, 25, 0.4, "#a7b0a6")
  face.position.set(0, shell.position.y + 3.5, headFront + 0.6)
  duck.add(face)
  const eyeY = shell.position.y + 16
  cylinder(
    duck,
    new THREE.Vector3(-1, eyeY, headFront + 1),
    new THREE.Vector3(-1, eyeY, headFront + 2.3),
    10,
    "#c48b1d"
  )
  cylinder(
    duck,
    new THREE.Vector3(-1, eyeY, headFront + 2.3),
    new THREE.Vector3(-1, eyeY, headFront + 2.6),
    8.4,
    "#f4bd2e"
  )
  cylinder(
    duck,
    new THREE.Vector3(-1, eyeY, headFront + 2.6),
    new THREE.Vector3(-1, eyeY, headFront + 2.9),
    4.6,
    "#182e35"
  )
  cylinder(
    duck,
    new THREE.Vector3(-2.5, eyeY + 2, headFront + 2.9),
    new THREE.Vector3(-2.5, eyeY + 2, headFront + 3),
    1.5,
    "#97c4c8"
  )
  box(duck, [4.5, 2.5, 0.5], [15, eyeY - 3, headFront + 1.25], "#35464b")
  const head = new THREE.Group()
  head.name = "head"
  head.position.set(0, hingeHeight, -headFront)
  const headParts = duck.children.filter((part) => part !== chassis)
  duck.add(head)
  duck.updateMatrixWorld(true)
  headParts.forEach((part) => head.attach(part))
  const upperBody = new THREE.Group()
  upperBody.name = "upperBody"
  duck.add(upperBody)
  upperBody.attach(torso)
  upperBody.attach(neck)
  upperBody.attach(badge)
  upperBody.attach(head)
  registerDuckRig(duck, { upperBody, head, jaw, legs })
  return duck
}
