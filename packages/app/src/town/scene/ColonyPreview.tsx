import { residentPointerEvents } from "./residentPointer"
import { useCallback, useEffect, useRef, useState } from "react"
import * as THREE from "three"
import { batchTown } from "./townBatch"
import { createHuman } from "@tardietown/characters"
import { residentAppearance } from "./residentAppearance"
import {
  box,
  createDuck,
  DEFAULT_HEAD_DEPTH,
  applyDuckPalette,
  type DuckPalette
} from "./duckModel"
import {
  applyDuckPose,
  NEUTRAL_DUCK_POSE,
  DEFAULT_DUCK_MOTION,
  type DuckPose,
  type DuckMotion
} from "./duckRig"
import { ThreePreview, type PreviewView } from "./ThreePreview"
import { startColonyWander, townGridSize, DEFAULT_COLONY_WALK } from "./colonyWander"
import { shuffleDuckPalettes } from "./duckPalettes"
import { bubblePreview, DEFAULT_BUBBLE_CHARACTERS, type Post, type Resident } from "../world"

export const DEFAULT_JAW_HOVER = {
  objectName: "jaw",
  rotationX: Math.PI / 9,
  durationMs: 220
}

export function CrewDuck({
  color,
  palette,
  pose = NEUTRAL_DUCK_POSE,
  motion = DEFAULT_DUCK_MOTION,
  hoverMotion = DEFAULT_JAW_HOVER,
  view = "isometric"
}: {
  color: string
  palette?: DuckPalette
  pose?: DuckPose
  motion?: DuckMotion
  hoverMotion?: typeof DEFAULT_JAW_HOVER
  view?: PreviewView
}) {
  const build = useCallback(() => createDuck(color), [color])
  const update = useCallback(
    (model: THREE.Group) => {
      if (palette) applyDuckPalette(model, palette)
      applyDuckPose(model, pose, motion)
    },
    [palette, pose, motion]
  )
  return (
    <ThreePreview
      build={build}
      update={update}
      hoverMotion={hoverMotion}
      height={165}
      targetY={67}
      interactive
      view={view}
      label="Robot duck in 3D. Drag to rotate."
    />
  )
}

export const DEFAULT_SPEECH_DURATION_MS = 8000

export function ColonyPreview({
  residents,
  humans = false,
  wandering = true,
  onBoard,
  onResident,
  onWorkspace,
  onLibrary,
  onPackages,
  artifactCount = 0,
  thinking,
  latestPost: incomingPost,
  speechDurationMs = DEFAULT_SPEECH_DURATION_MS,
  palettes: suppliedPalettes,
  bubbleCharacters = DEFAULT_BUBBLE_CHARACTERS
}: {
  residents: readonly Resident[]
  humans?: boolean
  wandering?: boolean
  onBoard?: () => void
  onResident?: (id: string) => void
  onWorkspace?: () => void
  onLibrary?: () => void
  onPackages?: () => void
  artifactCount?: number
  thinking?: string | readonly string[] | undefined
  latestPost?: Post | undefined
  speechDurationMs?: number
  palettes?: ReturnType<typeof shuffleDuckPalettes>
  bubbleCharacters?: number
}) {
  const [, expireSpeech] = useState(0)
  useEffect(() => {
    if (!incomingPost) return
    const remaining = incomingPost.at + speechDurationMs - Date.now()
    if (remaining <= 0) return
    const timer = setTimeout(() => expireSpeech((value) => value + 1), remaining)
    return () => clearTimeout(timer)
  }, [incomingPost?.id, incomingPost?.at, speechDurationMs])
  const latestPost = incomingPost && Date.now() < incomingPost.at + speechDurationMs ? incomingPost : undefined
  const batches = useRef(new WeakMap<THREE.Group, ReturnType<typeof batchTown>>())
  const gridSize = townGridSize(residents.length)
  const worldSize = gridSize * 32
  const humanRigs = useRef(new WeakMap<THREE.Object3D, ReturnType<typeof createHuman>>())
  const activity = useRef({ thinking, latestPost })
  activity.current = { thinking, latestPost }
  const wanderingRef = useRef(wandering)
  useEffect(() => { wanderingRef.current = wandering }, [wandering])
  const scene = useRef<{ town: THREE.Group; render: () => void } | null>(null)
  const animation = useRef(0)
  const [anchors, setAnchors] = useState<Record<string, { x: number; y: number; depth: number; occluded: boolean }>>({})
  const project = useCallback((town: THREE.Group, camera: THREE.OrthographicCamera) => {
    const next: Record<string, { x: number; y: number; depth: number; occluded: boolean }> = {}
    const raycaster = new THREE.Raycaster()
    town.children.forEach((duck) => {
      if (!duck.userData.residentId) return
      const { thinking, latestPost } = activity.current
      const id = duck.userData.residentId
      if (latestPost?.author !== id && !(typeof thinking === "string" ? thinking === id : thinking?.includes(id))) return
      const bounds = new THREE.Box3().setFromObject(duck)
      const world = new THREE.Vector3((bounds.min.x + bounds.max.x) / 2, bounds.max.y + 4, (bounds.min.z + bounds.max.z) / 2)
      const point = world.clone().project(camera)
      raycaster.setFromCamera(new THREE.Vector2(point.x, point.y), camera)
      raycaster.far = world.clone().sub(raycaster.ray.origin).dot(raycaster.ray.direction)
      const occluded = raycaster.intersectObjects(town.children.filter((object) => object !== duck), true).length > 0
      next[duck.userData.residentId] = { x: (point.x + 1) * 50, y: (1 - point.y) * 50, depth: point.z, occluded }
    })
    setAnchors((previous) => JSON.stringify(previous) === JSON.stringify(next) ? previous : next)
  }, [])
  const [fallbackPalettes] = useState(() => shuffleDuckPalettes())
  const palettes = suppliedPalettes ?? fallbackPalettes
  const build = useCallback(() => {
    const town = new THREE.Group()
    box(town, [worldSize, 12, worldSize], [0, -6, 0], "#80937b")
    for (let u = 0; u < gridSize; u++) {
      for (let v = 0; v < gridSize; v++) {
        const path = u === gridSize / 2 - 1 || u === gridSize / 2 || v === gridSize / 2 - 1 || v === gridSize / 2
        box(
          town,
          [31.4, 1, 31.4],
          [(u - (gridSize - 1) / 2) * 32, 0.5, (v - (gridSize - 1) / 2) * 32],
          path ? "#d5d2b8" : (u + v) % 2 ? "#a8ba91" : "#b3c19b"
        )
      }
    }
    const desk = new THREE.Group()
    desk.name = "artifactTable"
    desk.position.set(-96, 0, 64)
    box(desk, [35, 18, 28], [0, 10, 0], "#bcb7a6")
    box(desk, [39, 3, 32], [0, 20.5, 0], "#496775")
    for (let i = 0; i < 6; i++) {
      const stack = new THREE.Group()
      stack.name = `artifactStack-${i}`
      stack.position.set(i < 3 ? -9 : 9, 23 + (i % 3) * 2, 0)
      box(stack, [12, 1.5, 16], [0, 0, 0], i < 3 ? "#fff5d9" : "#dca85c")
      stack.scale.setScalar(0)
      desk.add(stack)
    }
    town.add(desk)
    const shelf = new THREE.Group()
    shelf.name = "libraryShelf"
    shelf.position.set(-148, 0, -80)
    shelf.rotation.y = Math.PI / 2
    box(shelf, [38, 34, 3], [0, 18, -5], "#8d7658")
    for (const x of [-19, 19]) box(shelf, [3, 36, 14], [x, 18, 0], "#b29a74")
    for (const y of [2, 18, 35]) box(shelf, [38, 3, 14], [0, y, 0], "#b29a74")
    const bookColors = ["#749b9b", "#d8ae61", "#a87968", "#89996c", "#9a8fa8", "#d4c6a1"]
    for (let row = 0; row < 2; row++) for (let i = 0; i < 6; i++) {
      const height = 10 + i % 3
      box(shelf, [4, height, 9], [-14 + i * 5.4, 4 + row * 16 + height / 2, 1], bookColors[(i + row * 2) % bookColors.length]!)
      box(shelf, [3, 0.8, 0.3], [-14 + i * 5.4, 7 + row * 16, 5.7], "#eee3cb")
    }
    town.add(shelf)
    const toolbox = new THREE.Group()
    toolbox.name = "packageToolbox"
    toolbox.position.set(worldSize / 2 - 24, 0, -worldSize / 2 + 24)
    box(toolbox, [30, 17, 22], [0, 9, 0], "#718578")
    box(toolbox, [32, 4, 24], [0, 19, 0], "#536b60")
    box(toolbox, [15, 3, 4], [0, 27, 0], "#46584d")
    for (const x of [-6, 6]) box(toolbox, [3, 6, 4], [x, 23, 0], "#46584d")
    box(toolbox, [8, 8, 3], [0, 15, 13], "#c6a263")
    box(toolbox, [2, 3, 1], [0, 15, 15], "#62533c")
    town.add(toolbox)
    for (const [x, z] of [
      [-110, -100],
      [-70, -120],
      [115, 95]
    ]) {
      box(town, [8, 20, 8], [x!, 11, z!], "#8a7860")
      box(town, [25, 23, 25], [x!, 29, z!], "#7f9e7b")
      box(town, [18, 14, 18], [x!, 47, z!], "#93b18a")
    }
    const messageBoard = new THREE.Group()
    messageBoard.name = "messageBoard"
    box(messageBoard, [4, 18, 4], [-20, 10, 0], "#708575")
    box(messageBoard, [4, 18, 4], [20, 10, 0], "#708575")
    box(messageBoard, [52, 27, 4], [0, 27, 0], "#7a8e7d")
    box(messageBoard, [46, 21, 0.6], [0, 27, 2.3], "#e3d9b8")
    for (const [x, y, color] of [
      [-13, 31, "#f8f1dc"],
      [1, 26, "#e5b978"],
      [14, 31, "#b4c7ac"]
    ] as const)
      box(messageBoard, [10, 11, 0.4], [x, y, 2.8], color)
    town.add(messageBoard)
    residents.forEach((resident, index) => {
      const angle = index * Math.PI * (3 - Math.sqrt(5))
      const radius = Math.sqrt((index + 0.5) / residents.length) * worldSize * 0.43
      const root = new THREE.Group()
      root.userData.residentId = resident.id
      if (humans) {
        const human = createHuman(residentAppearance(index))
        human.root.name = "rig"
        root.scale.setScalar(22)
        root.add(human.root)
        humanRigs.current.set(root, human)
      } else {
        const duck = createDuck(resident.color)
        applyDuckPalette(duck, palettes[index % palettes.length]!.colors)
        duck.name = "rig"
        duck.position.z = DEFAULT_HEAD_DEPTH / 2 + 4
        root.scale.setScalar(0.36)
        root.add(duck)
      }
      root.position.set(Math.cos(angle) * radius, 1, Math.sin(angle) * radius)
      town.add(root)
    })
    if (humans) batches.current.set(town, batchTown(town))
    return town
  }, [residents, palettes, humans, gridSize, worldSize])
  const setup = useCallback(
    (
      town: THREE.Group,
      camera: THREE.OrthographicCamera,
      canvas: HTMLCanvasElement,
      render: () => void
    ) => {
      let hovered: THREE.Object3D | undefined
      const batch = batches.current.get(town)
      const renderTown = () => { batch?.sync(); render() }
      scene.current = { town, render: renderTown }
      const stopWalking = startColonyWander(town, renderTown, () => wanderingRef.current, humans ? (root, sample, delta, moving) => {
        const human = humanRigs.current.get(root)
        if (!human) return
        const id = root.userData.residentId as string
        const { thinking, latestPost } = activity.current
        const busy = typeof thinking === "string" ? thinking === id : Boolean(thinking?.includes(id))
        human.update(moving ? delta : 0, sample.walking ? "walk" : busy ? "think" : latestPost?.author === id || root.userData.socialTalking ? "talk" : "idle")
      } : undefined, { ...DEFAULT_COLONY_WALK, size: gridSize, frameMs: residents.length > 100 ? 50 : 0 }, (id) => hovered?.userData.residentId === id)
      const raycaster = new THREE.Raycaster()
      let down = { x: 0, y: 0 }
      const pointerDown = (event: PointerEvent) => { down = { x: event.clientX, y: event.clientY } }
      const targetAt = (event: PointerEvent): THREE.Object3D | undefined => {
        const rect = canvas.getBoundingClientRect()
        raycaster.setFromCamera(
          new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            1 - ((event.clientY - rect.top) / rect.height) * 2
          ),
          camera
        )
        const hit = raycaster.intersectObject(town, true)[0]
        let object: THREE.Object3D | null = hit?.object ?? null
        while (object) {
          if (typeof object.userData.residentId === "string") {
            return onResident ? object : undefined
          }
          if (object.name === "packageToolbox") return onPackages ? object : undefined
          if (object.name === "libraryShelf") return onLibrary ? object : undefined
          if (object.name === "artifactTable") return onWorkspace ? object : undefined
          if (object.name === "messageBoard") return onBoard ? object : undefined
          object = object.parent
        }
      }
      const board = town.getObjectByName("messageBoard")!
      const originalScales = new Map(
        town.children.filter((object) => object === board || object.name === "artifactTable" || object.name === "libraryShelf" || object.name === "packageToolbox" || object.userData.residentId)
          .map((object) => [object, object.scale.clone()] as const)
      )
      let zoomFrame = 0
      const setHovered = (target?: THREE.Object3D) => {
        if (hovered === target) return
        hovered = target
        canvas.style.cursor = target ? "pointer" : ""
        cancelAnimationFrame(zoomFrame)
        const transitions = [...originalScales].filter(([object, scale]) => object === target || !object.scale.equals(scale))
          .map(([object, scale]) => ({ object, from: object.scale.clone(), goal: scale.clone().multiplyScalar(object === target ? 1.08 : 1) }))
        const started = performance.now()
        const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches
        const zoom = (now: number) => {
          const progress = reduced ? 1 : Math.min(1, (now - started) / 150)
          transitions.forEach(({ object, from, goal }) => object.scale.lerpVectors(from, goal, 1 - (1 - progress) ** 3))
          renderTown()
          if (progress < 1) zoomFrame = requestAnimationFrame(zoom)
        }
        zoomFrame = requestAnimationFrame(zoom)
      }
      const resetCursor = () => { setHovered(); canvas.style.cursor = "" }
      const hover = (event: PointerEvent) => {
        if (event.buttons) { resetCursor(); return }
        setHovered(targetAt(event))
      }
      const click = (event: PointerEvent) => {
        if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) return
        const target = targetAt(event)
        if (target?.userData.residentId) {
          residentPointerEvents.add(event)
          onResident?.(target.userData.residentId)
        }
        else if (target === board) onBoard?.()
        else if (target?.name === "artifactTable") onWorkspace?.()
        else if (target?.name === "packageToolbox") onPackages?.()
        else if (target?.name === "libraryShelf") onLibrary?.()
      }
      canvas.addEventListener("pointermove", hover)
      canvas.addEventListener("pointerleave", resetCursor)
      canvas.addEventListener("pointerdown", pointerDown)
      canvas.addEventListener("pointerup", click)
      return () => {
        stopWalking()
        batch?.dispose()
        cancelAnimationFrame(animation.current)
        scene.current = null
        resetCursor()
        cancelAnimationFrame(zoomFrame)
        originalScales.forEach((scale, object) => object.scale.copy(scale))
        canvas.removeEventListener("pointermove", hover)
        canvas.removeEventListener("pointerleave", resetCursor)
        canvas.removeEventListener("pointerdown", pointerDown)
        canvas.removeEventListener("pointerup", click)
      }
    },
    [onBoard, onResident, onWorkspace, onLibrary, onPackages, humans, gridSize, residents.length]
  )
  useEffect(() => {
    const current = scene.current
    if (!current || !thinking || humans) return
    const ids = typeof thinking === "string" ? [thinking] : thinking
    const jaws = current.town.children.filter((duck) => ids.includes(duck.userData.residentId)).map((duck) => duck.getObjectByName("jaw")).filter((jaw): jaw is THREE.Object3D => Boolean(jaw))
    if (!jaws.length) return
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)")
    const started = performance.now()
    const tick = (now: number) => {
      const elapsed = (now - started) / 1000
      const syllable = Math.max(0, Math.sin(elapsed * 15))
      const phrase = 0.55 + 0.45 * Math.sin(elapsed * 3.1) ** 2
      jaws.forEach((jaw) => { jaw.rotation.x = reduced.matches ? 0 : syllable * phrase * DEFAULT_JAW_HOVER.rotationX })
      current.render()
      if (!reduced.matches) animation.current = requestAnimationFrame(tick)
    }
    const restart = () => {
      cancelAnimationFrame(animation.current)
      tick(performance.now())
    }
    restart()
    reduced.addEventListener("change", restart)
    return () => {
      cancelAnimationFrame(animation.current)
      reduced.removeEventListener("change", restart)
      jaws.forEach((jaw) => { jaw.rotation.x = 0 })
      if (scene.current === current) current.render()
    }
  }, [thinking, build, setup, humans])
  const updateArtifacts = useCallback((town: THREE.Group) => {
    for (let i = 0; i < 6; i++) town.getObjectByName(`artifactStack-${i}`)?.scale.setScalar(i < artifactCount ? 1 : 0)
    batches.current.get(town)?.sync()
  }, [artifactCount])
  return (
    <div className="colony-preview">
      <ThreePreview
        build={build}
        update={updateArtifacts}
        setup={setup}
        onRender={project}
        zoomable
        frameWithin=".entry-land"
        height={260 * gridSize / 10}
        minWidth={475 * gridSize / 10}
        targetY={15}
        label={`Isometric town with ${residents.length} ${humans ? "townspeople" : "robot ducks"}: ${residents.map((resident) => resident.name).join(", ")}`}
      />
      <div className="duck-bubbles" aria-live="polite">
        {residents.map((resident) => {
          const anchor = anchors[resident.id]
          const busy = typeof thinking === "string" ? thinking === resident.id : Boolean(thinking?.includes(resident.id))
          const post = latestPost?.author === resident.id ? latestPost : undefined
          if (!anchor || anchor.occluded || (!busy && !post)) return null
          return <div key={resident.id} className="duck-bubble-anchor" style={{ left: `${anchor.x}%`, top: `${anchor.y}%`, zIndex: 1 + Object.values(anchors).filter((other) => other.depth > anchor.depth).length }}>
            <button type="button" className={`duck-speech ${busy ? "duck-thinking" : ""}`} onClick={onBoard}
              aria-label={busy ? `${resident.name} is thinking` : `${resident.name}: ${post!.text}. Open forum`}>
              {!busy && <strong>{resident.name}</strong>}
              {busy ? <span className="duck-thinking-content"><span className="duck-thinking-dots" aria-hidden="true"><i /><i /><i /></span></span>
                : <span className="duck-speech-text">{bubblePreview(post!.text, bubbleCharacters)}</span>}
            </button>
          </div>
        })}
      </div>
      <div className="surface-tag">
        <span /> TOWNSHIP / {String(residents.length).padStart(2, "0")}{" "}
        RESIDENTS
      </div>
    </div>
  )
}
