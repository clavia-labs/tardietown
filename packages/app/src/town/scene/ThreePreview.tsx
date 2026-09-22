import { useEffect, useRef, useState } from "react"
import * as THREE from "three"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"

export const DEFAULT_PREVIEW_ZOOM = { min: 0.65, max: 8, step: 1.35 }

export type PreviewView = "isometric" | "front" | "side" | "back"

export function ThreePreview({
  build,
  update,
  setup,
  onRender,
  hoverMotion,
  height,
  minWidth = 0,
  frameWithin,
  targetY,
  interactive = false,
  zoomable = false,
  zoomPolicy = DEFAULT_PREVIEW_ZOOM,
  view = "isometric",
  pixelRatio = window.devicePixelRatio,
  label
}: {
  build: () => THREE.Group
  update?: (model: THREE.Group) => void
  setup?: (
    model: THREE.Group,
    camera: THREE.OrthographicCamera,
    canvas: HTMLCanvasElement,
    render: () => void
  ) => () => void
  onRender?: (model: THREE.Group, camera: THREE.OrthographicCamera) => void
  hoverMotion?: { objectName: string; rotationX: number; durationMs: number }
  height: number
  minWidth?: number
  frameWithin?: string
  targetY: number
  interactive?: boolean
  zoomable?: boolean
  zoomPolicy?: typeof DEFAULT_PREVIEW_ZOOM
  view?: PreviewView
  pixelRatio?: number
  label: string
}) {
  const container = useRef<HTMLDivElement>(null)
  const active = useRef<{ model: THREE.Group; render: () => void } | null>(null)
  const zoom = useRef<(factor: number | null) => void>(() => {})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  useEffect(() => {
    setLoading(true)
    const mount = () => {
    const host = container.current!
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      setError(true)
      setLoading(false)
      return
    }
    setError(false)
    renderer.setPixelRatio(pixelRatio)
    renderer.setClearColor(0, 0)
    host.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    const model = build()
    scene.add(model)
    scene.add(new THREE.HemisphereLight("#fff9ec", "#536977", 2.5))
    const light = new THREE.DirectionalLight("#fff7e4", 2.5)
    light.position.set(-100, 200, 180)
    scene.add(light)
    const camera = new THREE.OrthographicCamera(
      -height / 2,
      height / 2,
      height / 2,
      -height / 2,
      0.1,
      Math.max(2000, minWidth * 6, height * 8)
    )
    const target = new THREE.Vector3(0, targetY, 0)
    const direction = {
      isometric: new THREE.Vector3(0.7, 0.5, 1),
      front: new THREE.Vector3(0, 0, 1),
      side: new THREE.Vector3(1, 0, 0),
      back: new THREE.Vector3(0, 0, -1)
    }[view]
    camera.position.copy(target).addScaledVector(direction.normalize(), Math.max(600, minWidth * 1.5, height * 2))
    camera.lookAt(target)
    const hoverPart = hoverMotion
      ? model.getObjectByName(hoverMotion.objectName)
      : undefined
    let framingShift = 0
    const render = () => {
      const halfHeight = (camera.top - camera.bottom) / 2
      const center = framingShift / camera.zoom
      if (Math.abs((camera.top + camera.bottom) / 2 - center) > 0.000001) {
        camera.top = halfHeight + center
        camera.bottom = -halfHeight + center
        camera.updateProjectionMatrix()
      }
      if (hoverPart)
        hoverPart.rotation.x = Math.max(
          hoverPart.userData.poseRotationX ?? 0,
          hoverPart.userData.hoverRotationX ?? 0
        )
      renderer.render(scene, camera)
      onRender?.(model, camera)
    }
    active.current = { model, render }
    update?.(model)
    const controls = interactive || zoomable
      ? new OrbitControls(camera, renderer.domElement)
      : undefined
    if (controls) {
      controls.target.copy(target)
      controls.enablePan = zoomable
      controls.enableZoom = zoomable
      controls.enableRotate = interactive
      controls.minZoom = zoomPolicy.min
      controls.maxZoom = zoomPolicy.max
      if (zoomable && !interactive) {
        controls.mouseButtons.LEFT = THREE.MOUSE.PAN
        controls.touches.ONE = THREE.TOUCH.PAN
        controls.touches.TWO = THREE.TOUCH.DOLLY_PAN
      }
      controls.update()
      controls.addEventListener("change", render)
    }
    zoom.current = (factor) => {
      camera.zoom = factor === null ? 1 : THREE.MathUtils.clamp(camera.zoom * factor, zoomPolicy.min, zoomPolicy.max)
      if (factor === null && controls) {
        controls.target.copy(target)
        camera.position.copy(target).addScaledVector(direction, Math.max(600, minWidth * 1.5, height * 2))
      }
      camera.updateProjectionMatrix()
      controls?.update()
      render()
    }
    let frame = 0
    const movingPart = hoverMotion
      ? model.getObjectByName(hoverMotion.objectName)
      : undefined
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
    const moveJaw = (open: boolean) => {
      if (!movingPart || !hoverMotion) return
      cancelAnimationFrame(frame)
      const from = movingPart.userData.hoverRotationX ?? 0
      const to = open ? hoverMotion.rotationX : 0
      if (reducedMotion.matches || hoverMotion.durationMs <= 0) {
        movingPart.userData.hoverRotationX = to
        render()
        return
      }
      const started = performance.now()
      const tick = (now: number) => {
        const progress = Math.min((now - started) / hoverMotion.durationMs, 1)
        movingPart.userData.hoverRotationX =
          from + (to - from) * (1 - (1 - progress) ** 3)
        render()
        if (progress < 1) frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
    }
    const enter = (event: PointerEvent) => {
      if (event.pointerType !== "touch") moveJaw(true)
    }
    const leave = () => moveJaw(false)
    if (movingPart) {
      host.addEventListener("pointerenter", enter)
      host.addEventListener("pointerleave", leave)
      host.addEventListener("pointercancel", leave)
    }
    const resize = () => {
      const { width, height: viewportHeight } = host.getBoundingClientRect()
      if (!width || !viewportHeight) return
      const reference = frameWithin ? host.closest(frameWithin)?.getBoundingClientRect() : undefined
      const referenceHeight = reference?.height || viewportHeight
      const aspect = width / referenceHeight
      const baseHeight = Math.max(height, minWidth / aspect)
      const frameHeight = baseHeight * viewportHeight / referenceHeight
      const shift = reference ? (reference.top + reference.height / 2 - host.getBoundingClientRect().top - viewportHeight / 2) * baseHeight / referenceHeight : 0
      camera.left = (-baseHeight * aspect) / 2
      camera.right = (baseHeight * aspect) / 2
      framingShift = shift
      camera.top = frameHeight / 2 + shift / camera.zoom
      camera.bottom = -frameHeight / 2 + shift / camera.zoom
      camera.updateProjectionMatrix()
      renderer.setSize(width, viewportHeight)
      render()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    const framingElement = frameWithin ? host.closest(frameWithin) : null
    if (framingElement) observer.observe(framingElement)
    resize()
    const teardown = setup?.(model, camera, renderer.domElement, render)
    setLoading(false)
    return () => {
      teardown?.()
      cancelAnimationFrame(frame)
      host.removeEventListener("pointerenter", enter)
      host.removeEventListener("pointerleave", leave)
      host.removeEventListener("pointercancel", leave)
      active.current = null
      observer.disconnect()
      controls?.dispose()
      model.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose()
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material]
          materials.forEach((material) => material.dispose())
        }
      })
      renderer.dispose()
      renderer.domElement.remove()
    }
    }
    let cleanup: (() => void) | undefined
    const timer = setTimeout(() => { cleanup = mount() }, 50)
    return () => { clearTimeout(timer); cleanup?.() }
  }, [
    build,
    height,
    minWidth,
    frameWithin,
    targetY,
    interactive,
    zoomable,
    zoomPolicy,
    view,
    pixelRatio,
    hoverMotion,
    setup,
    onRender
  ])
  useEffect(() => {
    if (active.current && update) {
      update(active.current.model)
      active.current.render()
    }
  }, [
    build,
    height,
    minWidth,
    frameWithin,
    targetY,
    interactive,
    zoomable,
    zoomPolicy,
    view,
    pixelRatio,
    hoverMotion,
    setup,
    update
  ])
  return (
    <div
      ref={container}
      className="three-preview"
      role={zoomable ? "group" : "img"}
      aria-busy={loading}
      aria-label={label}
    >
      {loading && !error && <div className="town-loading" role="status"><span className="town-spinner" />Building your town…</div>}
      {zoomable && !loading && !error && <div className="town-zoom" role="group" aria-label="Town zoom">
        <button type="button" aria-label="Zoom out" onClick={() => zoom.current(1 / zoomPolicy.step)}>−</button>
        <button type="button" aria-label="Fit town" onClick={() => zoom.current(null)}>Fit</button>
        <button type="button" aria-label="Zoom in" onClick={() => zoom.current(zoomPolicy.step)}>+</button>
      </div>}
      {error && (
        <p className="three-preview-error">
          The 3D preview needs WebGL. Try enabling graphics acceleration in your
          browser.
        </p>
      )}
    </div>
  )
}
