import { useTownPanel } from "../state/TownUiProvider"
import { useSceneCards } from "./useSceneCards"
import { residentPointerEvents } from "./residentPointer"
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import * as THREE from "three"
import { batchTown } from "./townBatch"
import { createHuman } from "@tardietown/characters"
import { residentAppearance } from "./residentAppearance"
import {
  createDuck,
  DEFAULT_HEAD_DEPTH,
  applyDuckPalette,
} from "./duckModel"
import { ThreePreview } from "./ThreePreview"
import { startTownWander, townGridSize, DEFAULT_TOWN_WALK } from "./townWander"
import { shuffleDuckPalettes } from "./duckPalettes"
import { createGround, createArtifactTable, createLibraryShelf, createPackageToolbox, createTownClock, createTrees, createMessageBoard, TOWN_OBJECTS, INTERACTIVE_OBJECT_NAMES } from "../objects"
import { DEFAULT_BUBBLE_CHARACTERS, type Post, type Resident } from "../world"
import { DEFAULT_JAW_HOVER } from "./CrewDuck"
import { TownClockCard } from "./TownClockCard"
import { ResidentBubbles } from "./ResidentBubbles"

export const DEFAULT_SPEECH_DURATION_MS = 8000

export function TownScene({
  timeline,
  residents,
  humans = false,
  wandering = true,
  onBoard,
  onResident,
  onWorkspace,
  onLibrary,
  onPackages,
  packagesPanel,
  artifactCount = 0,
  thinking,
  latestPost: incomingPost,
  speechDurationMs = DEFAULT_SPEECH_DURATION_MS,
  palettes: suppliedPalettes,
  bubbleCharacters = DEFAULT_BUBBLE_CHARACTERS
}: {
  timeline?: import("../protocol").TownTimeline | undefined
  residents: readonly Resident[]
  humans?: boolean
  wandering?: boolean
  onBoard?: () => void
  onResident?: (id: string) => void
  onWorkspace?: () => void
  onLibrary?: () => void
  packagesPanel?: ReactNode
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
  const [clockOpen, setClockOpen] = useTownPanel("clock")
  const [clockTime, setClockTime] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setClockTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])
  const worldSize = gridSize * 32
  const humanRigs = useRef(new WeakMap<THREE.Object3D, ReturnType<typeof createHuman>>())
  const activity = useRef({ thinking, latestPost })
  activity.current = { thinking, latestPost }
  const wanderingRef = useRef(wandering)
  useEffect(() => { wanderingRef.current = wandering }, [wandering])
  const scene = useRef<{ town: THREE.Group; render: () => void } | null>(null)
  const animation = useRef(0)
  const surface = useRef<HTMLDivElement>(null)
  const updateCardScene = useSceneCards(surface)
  const [anchors, setAnchors] = useState<Record<string, { x: number; y: number; depth: number; occluded: boolean }>>({})
  const project = useCallback((town: THREE.Group, camera: THREE.OrthographicCamera) => {
    updateCardScene(town, camera)
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
  }, [updateCardScene])
  const [fallbackPalettes] = useState(() => shuffleDuckPalettes())
  const palettes = suppliedPalettes ?? fallbackPalettes
  const build = useCallback(() => {
    const town = new THREE.Group()
    town.add(createGround(gridSize, worldSize))
    town.add(createArtifactTable())
    town.add(createLibraryShelf())
    town.add(createPackageToolbox(worldSize))
    town.add(createTownClock(worldSize))
    town.add(createTrees())
    town.add(createMessageBoard())
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
      const stopWalking = startTownWander(town, renderTown, () => wanderingRef.current, humans ? (root, sample, delta, moving) => {
        const human = humanRigs.current.get(root)
        if (!human) return
        const id = root.userData.residentId as string
        const { thinking, latestPost } = activity.current
        const busy = typeof thinking === "string" ? thinking === id : Boolean(thinking?.includes(id))
        human.update(moving ? delta : 0, sample.walking ? "walk" : busy ? "think" : latestPost?.author === id || root.userData.socialTalking ? "talk" : "idle")
      } : undefined, { ...DEFAULT_TOWN_WALK, size: gridSize, frameMs: residents.length > 100 ? 50 : 0 }, (id) => hovered?.userData.residentId === id)
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
          if (object.name === TOWN_OBJECTS.clock.name) return object
          if (object.name === TOWN_OBJECTS.packages.name) return onPackages ? object : undefined
          if (object.name === TOWN_OBJECTS.library.name) return onLibrary ? object : undefined
          if (object.name === TOWN_OBJECTS.workspace.name) return onWorkspace ? object : undefined
          if (object.name === TOWN_OBJECTS.forum.name) return onBoard ? object : undefined
          object = object.parent
        }
      }
      const board = town.getObjectByName(TOWN_OBJECTS.forum.name)!
      const originalScales = new Map(
        town.children.filter((object) => object === board || INTERACTIVE_OBJECT_NAMES.has(object.name) || object.userData.residentId)
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
        else if (target?.name === TOWN_OBJECTS.clock.name) setClockOpen(value => !value)
        else if (target === board) onBoard?.()
        else if (target?.name === TOWN_OBJECTS.workspace.name) onWorkspace?.()
        else if (target?.name === TOWN_OBJECTS.packages.name) onPackages?.()
        else if (target?.name === TOWN_OBJECTS.library.name) onLibrary?.()
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
  useEffect(() => {
    const current = scene.current
    if (!current) return
    const hour = current.town.getObjectByName("clockHour")
    const minute = current.town.getObjectByName("clockMinute")
    if (hour) hour.rotation.z = -(clockTime.getHours() % 12 + clockTime.getMinutes() / 60) * Math.PI / 6
    if (minute) minute.rotation.z = -clockTime.getMinutes() * Math.PI / 30
    batches.current.get(current.town)?.sync()
    current.render()
  }, [clockTime])
  const updateArtifacts = useCallback((town: THREE.Group) => {
    for (let i = 0; i < 6; i++) town.getObjectByName(`artifactStack-${i}`)?.scale.setScalar(i < artifactCount ? 1 : 0)
    batches.current.get(town)?.sync()
  }, [artifactCount])
  return (
    <div className="town-scene" ref={surface}>
      {packagesPanel && <div data-scene-card="packages" className="town-packages-anchor">{packagesPanel}</div>}
      {clockOpen && <TownClockCard time={clockTime} timeline={timeline} onClose={() => setClockOpen(false)} />}
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
      <ResidentBubbles residents={residents} anchors={anchors} thinking={thinking} latestPost={latestPost} characters={bubbleCharacters} onBoard={onBoard} />
    </div>
  )
}
