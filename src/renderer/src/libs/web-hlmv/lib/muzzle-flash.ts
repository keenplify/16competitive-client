import THREE from './three'

/** Mutable animation source; updating a flash does not rerender the model. */
export type MuzzleFlashSource = {
  canvas: HTMLCanvasElement
  visible: boolean
  revision: number
}

type MuzzleFlashSprite = THREE.Sprite & { material: THREE.SpriteMaterial }

export function createMuzzleFlash(source: MuzzleFlashSource): MuzzleFlashSprite {
  const map = new THREE.Texture(source.canvas)
  map.minFilter = THREE.LinearFilter
  map.magFilter = THREE.LinearFilter
  map.generateMipmaps = false
  const material = new THREE.SpriteMaterial({
    map,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthTest: true,
    depthWrite: false
  })
  const sprite = new THREE.Sprite(material) as MuzzleFlashSprite
  // Model materials include masked transparency; finish their depth writes first.
  sprite.renderOrder = 1
  sprite.visible = false
  sprite.frustumCulled = false
  return sprite
}

export function updateMuzzleFlash(
  sprite: MuzzleFlashSprite,
  source: MuzzleFlashSource,
  position: THREE.Vector3 | undefined,
  camera: THREE.PerspectiveCamera,
  viewportHeight: number
): void {
  sprite.visible = source.visible && Boolean(position) && viewportHeight > 0
  if (!sprite.visible || !position) return
  sprite.position.copy(position)
  const depth = -position.clone().applyMatrix4(camera.matrixWorldInverse).z
  if (depth <= camera.near || depth >= camera.far) {
    sprite.visible = false
    return
  }
  // Preserve the previous 96 CSS-pixel width while participating in model depth.
  const width = (96 / viewportHeight) * 2 * depth * Math.tan(THREE.Math.degToRad(camera.fov / 2))
  sprite.scale.set(width, (width * source.canvas.height) / source.canvas.width, 1)
  if (sprite.userData.revision !== source.revision) {
    sprite.material.map!.needsUpdate = true
    sprite.userData.revision = source.revision
  }
}
