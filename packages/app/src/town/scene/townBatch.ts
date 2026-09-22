import * as THREE from "three"

export function batchTown(town: THREE.Group) {
  const buckets = new Map<string, THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[]>()
  town.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !(object.material instanceof THREE.MeshStandardMaterial) || !object.visible) return
    const key = Array.from(object.geometry.attributes.position.array).join(",") + ":" + Array.from(object.geometry.attributes.normal.array).join(",")
    const bucket = buckets.get(key) ?? []
    bucket.push(object as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>)
    buckets.set(key, bucket)
  })
  const groups = [...buckets.values()].map((sources) => {
    const instances = new THREE.InstancedMesh(sources[0]!.geometry, new THREE.MeshStandardMaterial({ roughness: 0.9 }), sources.length)
    instances.name = "town-instances"
    instances.frustumCulled = false
    instances.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    instances.raycast = () => {}
    sources.forEach((source, index) => {
      instances.setColorAt(index, source.material.color)
      source.visible = false
    })
    town.add(instances)
    return { instances, sources }
  })
  function sync() {
    town.updateMatrixWorld(true)
    for (const { instances, sources } of groups) {
      sources.forEach((source, index) => instances.setMatrixAt(index, source.matrixWorld))
      instances.instanceMatrix.needsUpdate = true
    }
  }
  sync()
  return {
    sync,
    dispose() {
      for (const { instances, sources } of groups) {
        sources.forEach((source) => { source.visible = true })
        instances.removeFromParent()
        instances.dispose()
        instances.material.dispose()
      }
    }
  }
}
