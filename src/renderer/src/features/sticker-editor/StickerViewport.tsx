import { readFacesData } from '../../libs/web-hlmv/lib/geometryBuilder'
import { calcRotations } from '../../libs/web-hlmv/lib/geometryTransformer'
import {
  bakeProjectedStickers,
  fullColorStickerTextures,
  fullColorPreviewTextures
} from '../../libs/web-hlmv/lib/sticker-atlas'
import { useInventoryText } from '../inventory/inventory-i18n'
import { useEffect, useRef, useState } from 'react'
import THREE from '../../libs/web-hlmv/lib/three'
import { parseModelCached } from '../../libs/web-hlmv/lib/modelDataParser'
import {
  createModelMeshes,
  createContainer,
  prepareRenderData,
  createTexture
} from '../../libs/web-hlmv/lib/modelRenderer'
import { createRenderer, createOrbitControls } from '../../libs/web-hlmv/lib/screneRenderer'
import { buildTexture } from '../../libs/web-hlmv/lib/textureBuilder'
import { isHandTexture, modelTextures, texturePixels } from '../../../../shared/sticker-model'
import { useStickerEditor } from './sticker-editor.store'

export function StickerViewport({
  label,
  previewModel,
  weaponKey,
  onFirstFrame,
  onError
}: {
  label: string
  previewModel?: ArrayBuffer
  weaponKey?: string
  onFirstFrame?: (canvas: HTMLCanvasElement) => void
  onError?: () => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const editorFailed = useStickerEditor((s) => s.viewportFailed)
  const [previewFailed, setPreviewFailed] = useState(false)
  const readOnly = previewModel !== undefined
  const failed = readOnly ? previewFailed : editorFailed
  const t = useInventoryText()
  const editorModel = useStickerEditor((s) => s.model)
  const model = editorModel
  useEffect(() => {
    if (!host.current || (!previewModel && !model)) return
    const modelBytes = previewModel ? new Uint8Array(previewModel) : model!
    // StrictMode replays effects. Never reuse a canvas whose context cleanup destroyed.
    const element = document.createElement('canvas')
    host.current.appendChild(element)
    const source = modelBytes.slice().buffer as ArrayBuffer
    let renderer: THREE.WebGLRenderer
    try {
      renderer = createRenderer(element, Boolean(onFirstFrame))
      // Synchronize the error overlay with the newly created external WebGL context.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (readOnly) setPreviewFailed(false)
      else useStickerEditor.setState({ viewportFailed: false })
    } catch (error) {
      console.error('[StickerViewport] Renderer initialization failed', error)
      onError?.()
      element.remove()
      if (readOnly) setPreviewFailed(true)
      else useStickerEditor.setState({ placed: false, viewportFailed: true })
      return
    }
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000),
      scene = new THREE.Scene()
    const controls = createOrbitControls(camera, element, false, true)
    controls.enableRotate = true
    controls.rotateSpeed = 0.4
    controls.mouseButtons = {
      ORBIT: THREE.MOUSE.RIGHT,
      ZOOM: THREE.MOUSE.MIDDLE,
      PAN: THREE.MOUSE.LEFT
    }
    const data = parseModelCached(source)
    // A single authored idle frame makes UV picking deterministic and keeps preparation bounded.
    const staticData = { ...data, sequences: data.sequences.map((s) => ({ ...s, numFrames: 1 })) }
    const renderData = prepareRenderData(
      staticData,
      [0],
      undefined,
      readOnly && weaponKey === 'usp'
        ? (model, sequence, frame) => calcRotations(model, sequence, frame, 0, true)
        : undefined
    )
    const meshes = createModelMeshes(
      renderData,
      staticData,
      data.textures.map((t) => buildTexture(source, t))
    )
    if (
      readOnly &&
      weaponKey === 'm3' &&
      data.bones.length === 43 &&
      data.bones[42].name === 'Bone54'
    ) {
      meshes.forEach((body, bi) =>
        body.forEach((part, pi) =>
          part.forEach((mesh, mi) => {
            const texture = data.textures[data.skinRef[data.meshes[bi][pi][mi].skinRef]]
            const faces = readFacesData(data.triangles[bi][pi][mi], data.vertices[bi][pi], texture)
            const keep: number[] = []
            for (let i = 0; i < faces.indices.length; i += 3) {
              if ([0, 1, 2].every((v) => data.vertBoneBuffer[bi][pi][faces.indices[i + v]] === 42))
                continue
              keep.push(i, i + 1, i + 2)
            }
            const geometry = mesh.geometry as THREE.BufferGeometry
            for (const name of ['position', 'uv', 'normal']) {
              const attribute = geometry.getAttribute(name)
              if (!attribute) continue
              const values = new Float32Array(keep.length * attribute.itemSize)
              keep.forEach((index, at) => {
                for (let c = 0; c < attribute.itemSize; c++)
                  values[at * attribute.itemSize + c] =
                    attribute.array[index * attribute.itemSize + c]
              })
              geometry.addAttribute(name, new THREE.BufferAttribute(values, attribute.itemSize))
            }
          })
        )
      )
    }
    const flat = meshes.flat(2)
    meshes.forEach((body, bi) =>
      body.forEach((part, pi) =>
        part.forEach((mesh, mi) => {
          mesh.userData.texture = data.skinRef[data.meshes[bi][pi][mi].skinRef]
          mesh.visible =
            pi === 0 &&
            !isHandTexture(data.textures[mesh.userData.texture].name) &&
            !(
              readOnly &&
              weaponKey === 'xm1014' &&
              data.textures[mesh.userData.texture].name.toLowerCase() === 'shell.bmp'
            )
        })
      )
    )
    const container = createContainer(meshes)
    scene.add(container)
    if (readOnly && weaponKey === 'elite') {
      // Move complete pistol body parts, keeping their meshes aligned. These are
      // presentation transforms only; source geometry and sticker UVs stay intact.
      const pistols = meshes.flatMap((body, index) => {
        if (!/^weapon/i.test(data.bodyParts[index].name)) return []
        const visible = body.flat().filter((mesh) => mesh.visible)
        if (!visible.length) return []
        const bounds = new THREE.Box3()
        visible.forEach((mesh) => bounds.expandByObject(mesh))
        return [
          { meshes: visible, center: container.worldToLocal(bounds.getCenter(new THREE.Vector3())) }
        ]
      })
      if (pistols.length === 2) {
        const midpoint = pistols[0].center.clone().add(pistols[1].center).multiplyScalar(0.5)
        pistols.forEach((pistol) => {
          const offset = midpoint.clone().sub(pistol.center).multiplyScalar(0.5)
          pistol.meshes.forEach((mesh) => mesh.position.add(offset))
        })
        container.updateMatrixWorld(true)
      }
    }
    const bounds = new THREE.Box3()
    flat.filter((mesh) => mesh.visible).forEach((mesh) => bounds.expandByObject(mesh))
    const center = bounds.getCenter(new THREE.Vector3()),
      size = bounds.getSize(new THREE.Vector3())
    const distanceScale =
      weaponKey === 'knife' ||
      (readOnly && ['hegrenade', 'flashbang', 'smokegrenade'].includes(weaponKey ?? ''))
        ? 1.55
        : 1
    camera.position.copy(center).add(
      // The stock knife exposes the opposite blade face from the firearm view.
      // Use the same side for inspection and placement; never duplicate the decal
      // onto the back face. Orbit limits below keep placement on this side.
      new THREE.Vector3(weaponKey === 'knife' ? 1 : -1, readOnly ? 0 : 0.2, readOnly ? 0 : 0.35)
        .normalize()
        .multiplyScalar(size.length() * distanceScale)
    )
    camera.lookAt(center)
    // Keep zoom outside the mesh so it cannot expose the hidden side from within.
    controls.minDistance = size.length() * 0.65
    controls.maxDistance = size.length() * 2
    controls.target.copy(center)
    controls.update()
    // Allow a close inspection without orbiting to the non-player-facing side.
    const azimuth = controls.getAzimuthalAngle()
    const polar = controls.getPolarAngle()
    controls.minAzimuthAngle = azimuth - Math.PI / 9
    controls.maxAzimuthAngle = azimuth + Math.PI / 9
    controls.minPolarAngle = polar - Math.PI / 12
    controls.maxPolarAngle = polar + Math.PI / 12
    const raycaster = new THREE.Raycaster()
    let frame = 0,
      dirty = true,
      disposed = false,
      drag = false,
      initialPlacement = true
    const invalidate = () => {
      dirty = true
    }
    controls.addEventListener('change', invalidate)
    const resizeViewport = () => {
      const rect = element.parentElement!.getBoundingClientRect()
      renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height))
      camera.aspect = Math.max(1, rect.width) / Math.max(1, rect.height)
      camera.updateProjectionMatrix()
      dirty = true
    }
    resizeViewport()
    const resize = new ResizeObserver(resizeViewport)
    resize.observe(element.parentElement!)
    let currentMaps: THREE.Texture[] = []
    const update = () => {
      const state = useStickerEditor.getState()
      element.style.cursor = 'grab'
      let bytes = modelBytes
      let overrides = previewModel ? fullColorPreviewTextures.get(previewModel) : undefined
      if (!readOnly && state.atlas) {
        overrides = fullColorStickerTextures(state.atlas, [
          ...state.applied,
          ...(state.projection && state.sticker
            ? [{ sticker: state.sticker, projection: state.projection }]
            : [])
        ])
        bytes = bakeProjectedStickers(state.atlas, [
          ...state.applied,
          ...(state.projection && state.sticker
            ? [{ sticker: state.sticker, projection: state.projection }]
            : [])
        ])
      }
      const textures = modelTextures(bytes)
      const maps = textures.map((t, index) =>
        createTexture(
          overrides?.find((item) => item.texture === index)?.rgba ?? texturePixels(bytes, t),
          t.width,
          t.height
        )
      )
      const previous = new Set<THREE.Texture>()
      flat.forEach((mesh) => {
        const material = mesh.material as THREE.MeshBasicMaterial
        if (material.map) previous.add(material.map)
        material.map = maps[mesh.userData.texture]
        material.needsUpdate = true
      })
      previous.forEach((texture) => texture.dispose())
      currentMaps.forEach((texture) => texture.dispose())
      currentMaps = maps
      dirty = true
    }
    let updatePending = false
    const unsubscribe = readOnly
      ? () => undefined
      : useStickerEditor.subscribe((state, previous) => {
          if (
            state.placement === previous.placement &&
            state.projection === previous.projection &&
            state.sticker === previous.sticker &&
            state.applied === previous.applied
          )
            return
          updatePending = true
        })
    const pick = (event: Pick<PointerEvent, 'clientX' | 'clientY'>) => {
      if (readOnly || useStickerEditor.getState().busy || renderer.getContext().isContextLost())
        return
      const rect = element.getBoundingClientRect()
      raycaster.setFromCamera(
        new THREE.Vector2(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          (-(event.clientY - rect.top) / rect.height) * 2 + 1
        ),
        camera
      )
      const hit = raycaster.intersectObjects(flat.filter((m) => m.visible))[0]
      if (!hit?.uv) return
      const texture = hit.object.userData.texture as number
      if (
        data.textures[texture].flags & (2 | 32 | 64) ||
        isHandTexture(data.textures[texture].name)
      ) {
        useStickerEditor.setState({ message: 'surface' })
        return
      }
      if (!hit.face) return
      const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion)
      right.addScaledVector(normal, -right.dot(normal)).normalize()
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion)
      up.addScaledVector(normal, -up.dot(normal)).addScaledVector(right, -up.dot(right)).normalize()
      const inverse = new THREE.Matrix4().getInverse(hit.object.matrixWorld)
      const tuple = (v: THREE.Vector3) => v.toArray() as [number, number, number]
      const current = useStickerEditor.getState()
      current.setProjection(
        {
          center: tuple(hit.point.clone().applyMatrix4(inverse)),
          right: tuple(right.transformDirection(inverse)),
          up: tuple(up.transformDirection(inverse)),
          normal: tuple(normal.transformDirection(inverse)),
          size: current.placement.size,
          angle: current.placement.angle
        },
        texture
      )
    }
    const down = (event: PointerEvent) => {
      if (readOnly || event.button !== 0) return
      drag = true
      element.setPointerCapture(event.pointerId)
      pick(event)
    }
    const move = (event: PointerEvent) => {
      if (drag) pick(event)
    }
    const up = () => {
      drag = false
    }
    const over = (event: DragEvent) => {
      event.preventDefault()
    }
    const drop = (event: DragEvent) => {
      event.preventDefault()
      if (event.dataTransfer?.getData('text/plain') === '16c-sticker') pick(event)
    }
    element.addEventListener('dragover', over)
    element.addEventListener('drop', drop)
    element.addEventListener('pointerdown', down)
    element.addEventListener('pointermove', move)
    element.addEventListener('pointerup', up)
    element.addEventListener('pointercancel', up)
    const contextLost = (event: Event) => {
      event.preventDefault()
      cancelAnimationFrame(frame)
      onError?.()
      if (readOnly) setPreviewFailed(true)
      else useStickerEditor.setState({ placed: false, viewportFailed: true })
    }
    element.addEventListener('webglcontextlost', contextLost)
    update()
    const draw = () => {
      if (disposed) return
      frame = requestAnimationFrame(draw)
      if (updatePending) {
        updatePending = false
        update()
      }
      if (dirty) {
        renderer.render(scene, camera)
        dirty = false
        if (initialPlacement) {
          initialPlacement = false
          onFirstFrame?.(element)
          const state = useStickerEditor.getState()
          if (!readOnly && state.sticker && !state.projection) {
            const rect = element.getBoundingClientRect()
            // Start on geometry, not empty space at the bounds' center.
            for (const radius of [0, 0.04, 0.08, 0.12, 0.2]) {
              for (const [x, y] of [
                [0, -1],
                [-1, 0],
                [1, 0],
                [0, 1]
              ]) {
                pick({
                  clientX: rect.left + rect.width * (0.5 + x * radius),
                  clientY: rect.top + rect.height * (0.5 + y * radius)
                })
                if (useStickerEditor.getState().projection) break
              }
              if (useStickerEditor.getState().projection) break
            }
          }
        }
      }
    }
    draw()
    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      unsubscribe()
      resize.disconnect()
      controls.dispose()
      element.removeEventListener('pointerdown', down)
      element.removeEventListener('pointermove', move)
      element.removeEventListener('pointerup', up)
      element.removeEventListener('pointercancel', up)
      element.removeEventListener('dragover', over)
      element.removeEventListener('drop', drop)
      const maps = new Set<THREE.Texture>()
      flat.forEach((mesh) => {
        mesh.geometry.dispose()
        const material = mesh.material as THREE.MeshBasicMaterial
        if (material.map) maps.add(material.map)
        material.dispose()
      })
      maps.forEach((texture) => texture.dispose())
      currentMaps.forEach((texture) => texture.dispose())
      element.removeEventListener('webglcontextlost', contextLost)
      renderer.dispose()
      renderer.forceContextLoss()
      element.remove()
    }
  }, [model, previewModel, readOnly, weaponKey, onFirstFrame, onError])
  return (
    <div ref={host} className="absolute inset-0" aria-label={label} role="img">
      {failed && (
        <p role="alert" className="absolute inset-0 grid place-content-center px-6 text-center">
          {t('previewError')}
        </p>
      )}
    </div>
  )
}
