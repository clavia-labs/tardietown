import { useEffect, useState } from "react"
import * as THREE from "three"
import { createHuman } from "@tardietown/characters"
import { residentAppearance } from "./residentAppearance"

const portraits = new Map<number, string>()
function portrait(index: number) {
  const cached = portraits.get(index)
  if (cached) return cached
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
  renderer.setSize(80, 80)
  const scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9c998d, 3))
  const light = new THREE.DirectionalLight(0xfff4df, 3)
  light.position.set(-3, 6, 4)
  scene.add(light)
  const human = createHuman(residentAppearance(index))
  scene.add(human.root)
  const camera = new THREE.OrthographicCamera(-0.55, 0.55, 0.55, -0.55, 0.1, 20)
  camera.position.set(2.5, 2.5, 5)
  camera.lookAt(0, 1.83, 0)
  renderer.render(scene, camera)
  const image = renderer.domElement.toDataURL()
  human.dispose()
  renderer.dispose()
  renderer.forceContextLoss()
  portraits.set(index, image)
  return image
}
export function ResidentAvatar({ index }: { index: number }) {
  const [src, setSrc] = useState<string>()
  useEffect(() => { setSrc(portrait(index)) }, [index])
  return src ? <img className="duck-avatar" src={src} alt="" /> : <span className="duck-avatar" />
}
