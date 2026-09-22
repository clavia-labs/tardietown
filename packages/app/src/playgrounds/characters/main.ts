import * as THREE from "three"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import { createHuman, ACCESSORIES, type Accessory, OUTFITS, HAIRSTYLES, BOTTOMS, SHOE_STYLES, type Behavior } from "@tardietown/characters"
import "./styles.css"

const rows = [
  { id: "hair", label: "Hair", color: "#493c35" },
  { id: "top", label: "Top + accessories", color: "#83aaa4" },
  { id: "bottom", label: "Bottoms", color: "#45545e" },
  { id: "shoes", label: "Shoes", color: "#efe3cf" }
]
const arrow = (direction: string) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${direction === "previous" ? "M15 5 8 12l7 7" : "m9 5 7 7-7 7"}"/></svg>`
document.body.innerHTML = `<main><header><a href="/">Tardie Town</a><span>Character workshop</span></header><h1>Make someone.</h1><section aria-label="Interactive character preview" id="stage">${rows.map(({ id, label, color }) => `<div class="part-row" id="row-${id}"><div class="part-left"><button class="arrow" data-part="${id}" data-step="-1" aria-label="Previous ${label.toLowerCase()}">${arrow("previous")}</button><div class="part-detail"><span>${label}</span><output id="value-${id}" aria-live="polite"></output><input type="color" data-color="${id}" value="${color}" aria-label="${label} color">${id === "top" ? `<div class="accessories">${ACCESSORIES.map((name) => `<label><input type="checkbox" data-accessory="${name}">${name}</label>`).join("")}</div>` : ""}</div></div><button class="arrow" data-part="${id}" data-step="1" aria-label="Next ${label.toLowerCase()}">${arrow("next")}</button></div>`).join("")}</section><footer><div class="controls"><div class="behaviors" role="group" aria-label="Behavior">${["idle", "walk", "think", "talk"].map((name) => `<button data-behavior="${name}" aria-pressed="${name === "idle"}">${name}</button>`).join("")}</div><button id="pause" aria-pressed="false">Pause</button></div><p class="hint">Drag to turn. Scroll to zoom.</p></footer></main>`
const stage = document.querySelector<HTMLElement>("#stage")!
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100)
camera.position.set(2.6, 2.25, 6)
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
stage.append(renderer.domElement)
const controls = new OrbitControls(camera, renderer.domElement)
controls.target.set(0, 1.1, 0)
controls.enableDamping = true
controls.enablePan = false
controls.minDistance = 3
controls.maxDistance = 10
controls.maxPolarAngle = Math.PI / 2
scene.add(new THREE.HemisphereLight(0xffffff, 0x9c998d, 3))
const sun = new THREE.DirectionalLight(0xfff4df, 3)
sun.position.set(-3, 6, 4)
sun.castShadow = true
sun.shadow.mapSize.set(1024, 1024)
scene.add(sun)
const groundGeometry = new THREE.PlaneGeometry(200, 200)
const groundMaterial = new THREE.ShadowMaterial({ opacity: 0.13 })
const ground = new THREE.Mesh(groundGeometry, groundMaterial)
ground.rotation.x = -Math.PI / 2
ground.position.y = -0.005
ground.receiveShadow = true
scene.add(ground)
const human = createHuman()
scene.add(human.root)
let behavior: Behavior = "idle"
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)")
let paused = reducedMotion.matches
const pauseButton = document.querySelector<HTMLButtonElement>("#pause")!
function syncPause() {
  pauseButton.textContent = paused ? "Play" : "Pause"
  pauseButton.setAttribute("aria-pressed", String(paused))
}
syncPause()
document.querySelectorAll<HTMLButtonElement>("[data-behavior]").forEach((button) => {
  button.onclick = () => {
    behavior = button.dataset.behavior as Behavior
    document.querySelectorAll("[data-behavior]").forEach((other) => other.setAttribute("aria-pressed", String(other === button)))
    if (paused) human.update(1, behavior)
  }
})
const selections = {
  hair: { values: HAIRSTYLES, index: 0 },
  top: { values: OUTFITS, index: 0 },
  bottom: { values: BOTTOMS, index: 0 },
  shoes: { values: SHOE_STYLES, index: 0 }
}
type Part = keyof typeof selections
function syncParts() {
  for (const part of Object.keys(selections) as Part[]) {
    const selection = selections[part]
    document.querySelector(`#value-${part}`)!.textContent = selection.values[selection.index]!.replaceAll("-", " ")
  }
}
syncParts()
document.querySelectorAll<HTMLButtonElement>("[data-part]").forEach((button) => {
  button.onclick = () => {
    const part = button.dataset.part as Part
    const selection = selections[part]
    selection.index = (selection.index + Number(button.dataset.step) + selection.values.length) % selection.values.length
    if (part === "hair") {
      human.setHairstyle(HAIRSTYLES[selection.index]!)
    }
    if (part === "top") human.setOutfit(OUTFITS[selection.index]!)
    if (part === "bottom") human.setLegwear({ bottom: BOTTOMS[selection.index]! })
    if (part === "shoes") human.setLegwear({ shoes: SHOE_STYLES[selection.index]! })
    syncParts()
  }
})
const paletteKeys = { hair: "hair", top: "shirt", bottom: "trousers", shoes: "shoes" } as const
document.querySelectorAll<HTMLInputElement>("[data-color]").forEach((input) => {
  input.oninput = () => human.setPalette({ [paletteKeys[input.dataset.color as Part]]: input.value })
})
document.querySelectorAll<HTMLInputElement>("[data-accessory]").forEach((input) => {
  input.onchange = () => human.setAccessories({ [input.dataset.accessory as Accessory]: input.checked })
})
pauseButton.onclick = () => { paused = !paused; syncPause() }
const resize = new ResizeObserver(() => {
  const { width, height } = stage.getBoundingClientRect()
  camera.aspect = width / Math.max(height, 1)
  camera.zoom = width < 600 ? 0.9 : 1.1
  camera.updateProjectionMatrix()
  renderer.setSize(width, height)
})
resize.observe(stage)
const anchors = [1.92, 1.29, 0.61, 0.12]
const rowElements = rows.map(({ id }) => document.querySelector<HTMLElement>(`#row-${id}`)!)
const projected = new THREE.Vector3()
let last = performance.now()
renderer.setAnimationLoop((now) => {
  const delta = Math.min((now - last) / 1000, 0.05)
  last = now
  if (!paused && !document.hidden) human.update(delta, behavior)
  controls.update()
  renderer.render(scene, camera)
  rowElements.forEach((element, index) => {
    projected.set(0, anchors[index]!, 0).project(camera)
    element.style.top = `${(1 - projected.y) * stage.clientHeight / 2}px`
  })
})
if (import.meta.hot) import.meta.hot.dispose(() => {
  renderer.setAnimationLoop(null)
  resize.disconnect()
  controls.dispose()
  human.dispose()
  groundGeometry.dispose()
  groundMaterial.dispose()
  renderer.dispose()
})
