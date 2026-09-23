import { Button as Action } from "@base-ui/react/button"
import { useCallback, useMemo, useRef, useState } from "react"
import { createRoot } from "react-dom/client"
import * as THREE from "three"
import { ThreePreview } from "../../town/scene/ThreePreview"
import { box, createDuck, DEFAULT_HEAD_DEPTH } from "../../town/scene/duckModel"
import {
  applyDuckPose,
  DEFAULT_DUCK_MOTION,
  NEUTRAL_DUCK_POSE,
  sampleGridFeet
} from "../../town/scene/duckRig"
import {
  cellKey,
  DEFAULT_GRID_CONFIG,
  GridController,
  gridToWorld,
  type Cell
} from "../../town/scene/gridController"
import { makeResidents } from "../../town/world"
import "../../town/setup.css"
import "./styles.css"

const DUCK_SCALE = 0.3
const GRID_MOTION = { ...DEFAULT_DUCK_MOTION, stride: 14 }

function GridStudy() {
  const [count, setCount] = useState(3)
  const [revision, setRevision] = useState(0)
  const [selected, setSelected] = useState("resident-0")
  const [edit, setEdit] = useState(false)
  const [status, setStatus] = useState("Choose a duck, then click a tile.")
  const [moveMs, setMoveMs] = useState<number>(DEFAULT_GRID_CONFIG.moveMs)
  const residents = useMemo(() => makeResidents(count), [count])
  const controller = useMemo(
    () =>
      new GridController(
        residents.map((resident, i) => ({
          id: resident.id,
          cell: {
            x: i % DEFAULT_GRID_CONFIG.size,
            z: Math.floor(i / DEFAULT_GRID_CONFIG.size)
          }
        })),
        [
          { x: 3, z: 3 },
          { x: 3, z: 4 },
          { x: 4, z: 4 }
        ],
        { ...DEFAULT_GRID_CONFIG, moveMs }
      ),
    [residents, revision, moveMs]
  )
  const selectedRef = useRef(selected)
  selectedRef.current = selected
  const editRef = useRef(edit)
  editRef.current = edit
  const actions = useRef<{ wake: () => void; refresh: () => void } | null>(null)
  const build = useCallback(() => {
    const board = new THREE.Group()
    const extent = controller.config.size * controller.config.cellSize
    box(board, [extent, 7, extent], [0, -3.5, 0], "#819786")
    for (let x = 0; x < controller.config.size; x++)
      for (let z = 0; z < controller.config.size; z++) {
        const point = gridToWorld({ x, z }, controller.config)
        const tile = box(
          board,
          [controller.config.cellSize - 1, 1, controller.config.cellSize - 1],
          [point.x, 0.5, point.z],
          (x + z) % 2 ? "#b8c6a4" : "#c7d1b5"
        )
        tile.name = `tile:${x},${z}`
        tile.userData.cell = { x, z }
        tile.userData.baseColor = (x + z) % 2 ? "#b8c6a4" : "#c7d1b5"
        const obstacle = box(
          board,
          [25, 16, 25],
          [point.x, 9, point.z],
          "#86998e"
        )
        obstacle.name = `obstacle:${x},${z}`
        obstacle.visible = controller.blocked.has(cellKey({ x, z }))
        obstacle.userData.cell = { x, z }
      }
    residents.forEach((resident) => {
      const root = new THREE.Group()
      root.name = resident.id
      root.userData.agentId = resident.id
      const duck = createDuck(resident.color)
      duck.name = "rig"
      duck.position.z = DEFAULT_HEAD_DEPTH / 2 + 4
      root.scale.setScalar(DUCK_SCALE)
      root.add(duck)
      board.add(root)
    })
    return board
  }, [controller, residents])

  const setup = useCallback(
    (
      board: THREE.Group,
      camera: THREE.OrthographicCamera,
      canvas: HTMLCanvasElement,
      render: () => void
    ) => {
      let frame = 0
      let last = 0
      let hovered: string | null = null
      let disposed = false
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)")
      const tiles: THREE.Mesh[] = []
      board.traverse((part) => {
        if (part instanceof THREE.Mesh && part.name.startsWith("tile:"))
          tiles.push(part)
      })
      const refresh = () => {
        const selectedAgent = controller.agents.get(selectedRef.current)!
        const route = new Set(selectedAgent.route.map(cellKey))
        for (const tile of tiles) {
          const cell = tile.userData.cell as Cell
          const key = cellKey(cell)
          const obstacle = board.getObjectByName(`obstacle:${key}`)!
          obstacle.visible = controller.blocked.has(key)
          const material = tile.material as THREE.MeshStandardMaterial
          material.color.set(
            key === hovered
              ? "#e4c589"
              : selectedAgent.goal && cellKey(selectedAgent.goal) === key
                ? "#d8a258"
                : route.has(key)
                  ? "#e1d5ac"
                  : tile.userData.baseColor
          )
        }
        for (const agent of controller.agents.values()) {
          const root = board.getObjectByName(agent.id)!
          const duck = root.getObjectByName("rig") as THREE.Group
          const sample = controller.sample(agent.id)
          root.position.set(sample.x, 1, sample.z)
          root.rotation.y = sample.heading
          applyDuckPose(
            duck,
            NEUTRAL_DUCK_POSE,
            GRID_MOTION,
            sample.walking && !reduced.matches
              ? sampleGridFeet(
                  sample.progress,
                  controller.config.cellSize / DUCK_SCALE,
                  GRID_MOTION
                )
              : undefined
          )
        }
        render()
      }
      const tick = (now: number) => {
        frame = 0
        if (disposed) return
        controller.advance(last ? now - last : 0)
        last = now
        refresh()
        const agent = controller.agents.get(selectedRef.current)!
        setStatus(
          `${residents.find((resident) => resident.id === agent.id)!.name} · ${agent.phase} · column ${agent.cell.x + 1}, row ${agent.cell.z + 1}`
        )
        if ([...controller.agents.values()].some((agent) => agent.next))
          frame = requestAnimationFrame(tick)
      }
      const wake = () => {
        if (!frame) {
          last = 0
          frame = requestAnimationFrame(tick)
        }
      }
      actions.current = { wake, refresh }
      const raycaster = new THREE.Raycaster()
      const hit = (event: PointerEvent) => {
        const rect = canvas.getBoundingClientRect()
        raycaster.setFromCamera(
          new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            (-(event.clientY - rect.top) / rect.height) * 2 + 1
          ),
          camera
        )
        return raycaster.intersectObject(board, true).find((result) => {
          if (!result.object.visible) return false
          let part: THREE.Object3D | null = result.object
          while (part) {
            if (part.userData.cell || part.userData.agentId) return true
            part = part.parent
          }
          return false
        })
      }
      const send = (cell: Cell) => {
        if (editRef.current) {
          setStatus(
            controller.toggleBlock(cell)
              ? "Obstacle updated."
              : "That tile is occupied or reserved."
          )
          refresh()
          wake()
          return
        }
        const accepted = controller.command(selectedRef.current, cell)
        setStatus(accepted ? "Route ready." : "No clear route to that tile.")
        refresh()
        if (accepted) wake()
      }
      const click = (event: PointerEvent) => {
        const result = hit(event)
        if (!result) return
        let part: THREE.Object3D | null = result.object
        while (part && !part.userData.agentId) part = part.parent
        if (part?.userData.agentId && !editRef.current) {
          selectedRef.current = part.userData.agentId
          setSelected(part.userData.agentId)
          refresh()
          return
        }
        if (result.object.userData.cell) send(result.object.userData.cell)
      }
      const hover = (event: PointerEvent) => {
        const result = hit(event)
        const next = result?.object.userData.cell
          ? cellKey(result.object.userData.cell)
          : null
        if (next !== hovered) {
          hovered = next
          refresh()
        }
      }
      const leave = () => {
        hovered = null
        refresh()
      }
      const keydown = (event: KeyboardEvent) => {
        const directions: Record<string, Cell> = {
          ArrowUp: { x: 0, z: -1 },
          ArrowDown: { x: 0, z: 1 },
          ArrowLeft: { x: -1, z: 0 },
          ArrowRight: { x: 1, z: 0 }
        }
        const direction = directions[event.key]
        if (!direction) return
        event.preventDefault()
        const agent = controller.agents.get(selectedRef.current)!
        const from = agent.next ?? agent.cell
        send({ x: from.x + direction.x, z: from.z + direction.z })
      }
      const visibility = () => {
        last = 0
      }
      canvas.tabIndex = 0
      canvas.setAttribute(
        "aria-label",
        "Grid playground. Arrow keys move the selected duck one tile."
      )
      canvas.addEventListener("pointerup", click)
      canvas.addEventListener("pointermove", hover)
      canvas.addEventListener("pointerleave", leave)
      canvas.addEventListener("keydown", keydown)
      document.addEventListener("visibilitychange", visibility)
      refresh()
      return () => {
        disposed = true
        cancelAnimationFrame(frame)
        actions.current = null
        canvas.removeEventListener("pointerup", click)
        canvas.removeEventListener("pointermove", hover)
        canvas.removeEventListener("pointerleave", leave)
        canvas.removeEventListener("keydown", keydown)
        document.removeEventListener("visibilitychange", visibility)
      }
    },
    [controller, residents]
  )

  return (
    <main className="grid-page">
      <header>
        <div>
          <h1>Grid study</h1>
          <p>Choose a duck. Click a tile to send it there.</p>
        </div>
        <a href="./duck.html">Back to duck study</a>
      </header>
      <div className="grid-toolbar">
        <div className="grid-crew" aria-label="Choose a duck">
          {residents.map((resident) => (
            <Action
              key={resident.id}
              type="button"
              aria-pressed={selected === resident.id}
              onClick={() => {
                selectedRef.current = resident.id
                setSelected(resident.id)
                actions.current?.refresh()
              }}
            >
              <i style={{ background: resident.color }} />
              {resident.name}
            </Action>
          ))}
        </div>
        <Action
          type="button"
          aria-pressed={edit}
          onClick={() => setEdit((value) => !value)}
        >
          Place obstacles
        </Action>
        <Action
          type="button"
          onClick={() => {
            controller.stop(selected)
            actions.current?.refresh()
            setStatus("Stopping at the next tile.")
          }}
        >
          Stop
        </Action>
        <Action
          type="button"
          onClick={() => {
            setRevision((value) => value + 1)
            setStatus("Grid reset.")
          }}
        >
          Reset
        </Action>
      </div>
      <div className="grid-stage">
        <ThreePreview
          build={build}
          setup={setup}
          height={320}
          targetY={10}
          label="Square grid with movable robot ducks"
        />
      </div>
      <p className="grid-status" role="status">
        {status}
      </p>
      <footer>
        <span>
          {controller.config.size} × {controller.config.size} tiles
        </span>
        <label>
          Ducks{" "}
          <select
            aria-label="Ducks"
            value={count}
            onChange={(event) => {
              setCount(Number(event.target.value))
              setSelected("resident-0")
              setStatus("Grid reset with the new crew.")
            }}
          >
            {Array.from({ length: 8 }, (_, i) => (
              <option key={i} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
        </label>
        <label>
          Step time{" "}
          <select
            aria-label="Step time"
            value={moveMs}
            onChange={(event) => {
              setMoveMs(Number(event.target.value))
              setStatus("Grid reset at the new speed.")
            }}
          >
            <option value={2200}>Slow</option>
            <option value={1400}>Normal</option>
            <option value={900}>Quick</option>
          </select>
        </label>
        <span>Arrow keys also move the selected duck.</span>
      </footer>
    </main>
  )
}
createRoot(document.getElementById("root")!).render(<GridStudy />)
