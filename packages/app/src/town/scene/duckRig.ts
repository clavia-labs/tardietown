import * as THREE from "three"

export interface DuckPose {
  stretch: number
  look: number
  nod: number
  step: number
  mouth: number
}

export const NEUTRAL_DUCK_POSE: DuckPose = {
  stretch: 0,
  look: 0,
  nod: 0,
  step: 0,
  mouth: 0
}
export const DEFAULT_DUCK_MOTION = {
  crouchDepth: 12,
  stretchHeight: 3,
  lookAngle: Math.PI / 5,
  nodAngle: Math.PI / 18,
  stride: 6,
  footLift: 6,
  stepBob: 2,
  mouthAngle: Math.PI / 9,
  durationMs: 1600
}
export type DuckMotion = typeof DEFAULT_DUCK_MOTION
export type DuckBehavior = "stretch" | "crouch" | "look" | "step" | "talk"

export interface DuckLegRig {
  hip: THREE.Vector3
  ankle: THREE.Vector3
  upperLength: number
  lowerLength: number
  upper: THREE.Mesh
  lower: THREE.Mesh
  hipJoint: THREE.Mesh
  kneeJoint: THREE.Mesh
  foot: THREE.Mesh
}

export interface DuckRig {
  upperBody: THREE.Group
  head: THREE.Group
  jaw: THREE.Group
  legs: DuckLegRig[]
}

const rigs = new WeakMap<THREE.Group, DuckRig>()
export function registerDuckRig(model: THREE.Group, rig: DuckRig) {
  rigs.set(model, rig)
}

export function solveDuckKnee(
  hip: THREE.Vector3,
  ankle: THREE.Vector3,
  upperLength: number,
  lowerLength: number
) {
  const direction = ankle.clone().sub(hip)
  const distance = direction.length()
  if (
    distance === 0 ||
    distance > upperLength + lowerLength + 1e-8 ||
    distance < Math.abs(upperLength - lowerLength) - 1e-8
  ) {
    throw new RangeError("Foot target is outside the leg's reach.")
  }
  direction.divideScalar(distance)
  const along =
    (upperLength ** 2 - lowerLength ** 2 + distance ** 2) / (2 * distance)
  const bend = Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2))
  const forward = new THREE.Vector3(0, direction.z, -direction.y).normalize()
  return hip
    .clone()
    .addScaledVector(direction, along)
    .addScaledVector(forward, bend)
}

function placeSegment(
  mesh: THREE.Mesh,
  from: THREE.Vector3,
  to: THREE.Vector3
) {
  mesh.position.copy(from).add(to).multiplyScalar(0.5)
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    to.clone().sub(from).normalize()
  )
}

export function applyDuckPose(
  model: THREE.Group,
  pose: DuckPose,
  motion = DEFAULT_DUCK_MOTION,
  footTargets?: readonly { forward: number; lift: number }[]
) {
  const rig = rigs.get(model)
  if (!rig) throw new Error("The model has no duck rig.")
  if (!Object.values(pose).every(Number.isFinite))
    throw new RangeError("Pose values must be finite.")
  if (
    Math.abs(pose.stretch) > 1 ||
    Math.abs(pose.look) > 1 ||
    Math.abs(pose.nod) > 1 ||
    pose.step < 0 ||
    pose.step > 1 ||
    pose.mouth < 0 ||
    pose.mouth > 1
  )
    throw new RangeError("Pose values are outside their normalized ranges.")
  const phase = Math.sin(pose.step * Math.PI * 2)
  const requestedRise =
    pose.stretch *
      (pose.stretch < 0 ? motion.crouchDepth : motion.stretchHeight) -
    Math.abs(phase) * motion.stepBob
  if (
    footTargets &&
    (footTargets.length !== rig.legs.length ||
      footTargets.some(
        (target) =>
          !Number.isFinite(target.forward) ||
          !Number.isFinite(target.lift) ||
          target.lift < 0
      ))
  )
    throw new RangeError(
      "Foot targets must provide a finite forward offset and nonnegative lift for each leg."
    )
  const ankles = rig.legs.map((leg, index) => {
    const target = footTargets?.[index]
    return leg.ankle
      .clone()
      .add(
        new THREE.Vector3(
          0,
          target
            ? target.lift
            : Math.max(0, phase * (index === 0 ? 1 : -1)) * motion.footLift,
          target
            ? target.forward
            : phase * (index === 0 ? 1 : -1) * motion.stride
        )
      )
  })
  const maxRise = Math.min(
    ...rig.legs.map((leg, index) => {
      const ankle = ankles[index]!
      const horizontal = ankle.z - leg.hip.z
      const reach = leg.upperLength + leg.lowerLength
      if (Math.abs(horizontal) > reach)
        throw new RangeError("Stride exceeds leg reach.")
      return ankle.y + Math.sqrt(reach ** 2 - horizontal ** 2) - leg.hip.y
    })
  )
  const appliedRise = Math.min(requestedRise, maxRise)
  const solutions = rig.legs.map((leg, index) => {
    const hip = leg.hip.clone().add(new THREE.Vector3(0, appliedRise, 0))
    const ankle = ankles[index]!
    return {
      hip,
      ankle,
      knee: solveDuckKnee(hip, ankle, leg.upperLength, leg.lowerLength)
    }
  })
  rig.upperBody.position.y = appliedRise
  rig.head.rotation.set(
    pose.nod * motion.nodAngle,
    pose.look * motion.lookAngle,
    0,
    "YXZ"
  )
  rig.jaw.userData.poseRotationX = pose.mouth * motion.mouthAngle
  rig.jaw.rotation.x = Math.max(
    rig.jaw.userData.poseRotationX,
    rig.jaw.userData.hoverRotationX ?? 0
  )
  rig.legs.forEach((leg, index) => {
    const { hip, knee, ankle } = solutions[index]!
    placeSegment(leg.upper, hip, knee)
    placeSegment(leg.lower, knee, ankle)
    leg.hipJoint.position.copy(hip)
    leg.kneeJoint.position.copy(knee)
    leg.foot.position.copy(ankle).add(new THREE.Vector3(0, 0, 4))
  })
  return {
    requestedRise,
    appliedRise,
    reachLimited: appliedRise < requestedRise,
    legs: solutions
  }
}

export function sampleDuckBehavior(
  behavior: DuckBehavior,
  progress: number
): DuckPose {
  if (!Number.isFinite(progress) || progress < 0 || progress > 1)
    throw new RangeError("Behavior progress must be between zero and one.")
  const pose = { ...NEUTRAL_DUCK_POSE }
  const pulse = Math.sin(progress * Math.PI) ** 2
  if (behavior === "stretch") pose.stretch = pulse
  if (behavior === "crouch") pose.stretch = -pulse
  if (behavior === "look")
    pose.look = Math.sin(progress * Math.PI * 2) * Math.sin(progress * Math.PI)
  if (behavior === "step") pose.step = progress
  if (behavior === "talk")
    pose.mouth = Math.sin(progress * Math.PI * 4) ** 2 * pulse
  return pose
}

export function sampleGridFeet(
  progress: number,
  distance: number,
  motion = DEFAULT_DUCK_MOTION
) {
  if (
    !Number.isFinite(progress) ||
    progress < 0 ||
    progress > 1 ||
    !Number.isFinite(distance) ||
    distance <= 0 ||
    motion.stride <= 0
  )
    throw new RangeError(
      "Walking needs progress from zero to one, positive distance, and positive stride."
    )
  const cycles = Math.ceil(distance / (2 * motion.stride))
  const cycleDistance = distance / cycles
  const phase = progress === 1 ? 1 : (progress * cycles) % 1
  return [0, 1].map((index) => {
    const swing = Math.max(0, Math.min(1, phase * 2 - index))
    const eased = swing * swing * (3 - 2 * swing)
    return {
      forward: (eased - phase) * cycleDistance,
      lift: Math.sin(swing * Math.PI) * motion.footLift
    }
  })
}
