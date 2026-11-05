import { tintInspectionSide } from '../../libs/web-hlmv/lib/inspection-side-tint'
import { viewmodelNeedsMirror } from '../skins/viewmodel-presentation'
import { readFacesData } from '../../libs/web-hlmv/lib/geometryBuilder'
import { calcRotations } from '../../libs/web-hlmv/lib/geometryTransformer'
import {
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
import { isHandTexture } from '../../../../shared/sticker-model'
import { useStickerEditor } from './sticker-editor.store'

export function StickerViewport({
  label,
  previewModel,
  stockModel = previewModel === undefined,
  presentationRotation,
  hiddenTextures,
  weaponKey,
  firstPerson = false,
  highlightInspectionSide = false,
  onFirstFrame,
  onError
}: {
  label: string
  firstPerson?: boolean
  highlightInspectionSide?: boolean
  previewModel?: ArrayBuffer
  stockModel?: boolean
  presentationRotation?: readonly [number, number, number]
  hiddenTextures?: readonly string[]
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
    const resources: (() => void)[] = [() => element.remove()]
    let disposed = false
    const cleanup = () => {
      if (disposed) return
      disposed = true
      for (const release of resources.reverse()) {
        try {
          release()
        } catch (error) {
          console.error('[StickerViewport] Cleanup failed', error)
        }
      }
    }
    const fail = (error: unknown) => {
      console.error('[StickerViewport] Preview failed', error)
      cleanup()
      if (readOnly) setPreviewFailed(true)
      else useStickerEditor.setState({ placed: false, viewportFailed: true })
      onError?.()
    }
    try {
      const renderer = createRenderer(element, Boolean(onFirstFrame))
      resources.push(() => {
        renderer.dispose()
        renderer.forceContextLoss()
      })
      // Authoring uses four backing pixels per CSS pixel, independent of display DPI.
      if (!readOnly) renderer.setPixelRatio(4)
      // Synchronize the overlay with the new external WebGL context.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (readOnly) setPreviewFailed(false)
      else useStickerEditor.setState({ viewportFailed: false })
      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000),
        scene = new THREE.Scene()
      const controls = createOrbitControls(camera, element, false, true)
      resources.push(() => controls.dispose())
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
        readOnly || !stockModel
          ? (model, sequence, frame) => calcRotations(model, sequence, frame, 0, true)
          : undefined
      )
      const meshes = createModelMeshes(
        renderData,
        staticData,
        data.textures.map((t) => buildTexture(source, t))
      )
      const ownedMaps = new Set<THREE.Texture>()
      resources.push(() => {
        meshes.flat(2).forEach((mesh) => {
          mesh.geometry.dispose()
          const material = mesh.material as THREE.MeshBasicMaterial
          if (material.map) ownedMaps.add(material.map)
          material.dispose()
        })
        ownedMaps.forEach((texture) => texture.dispose())
      })
      if (
        readOnly &&
        stockModel &&
        weaponKey === 'm3' &&
        data.bones.length === 43 &&
        data.bones[42].name === 'Bone54'
      ) {
        meshes.forEach((body, bi) =>
          body.forEach((part, pi) =>
            part.forEach((mesh, mi) => {
              const texture = data.textures[data.skinRef[data.meshes[bi][pi][mi].skinRef]]
              const faces = readFacesData(
                data.triangles[bi][pi][mi],
                data.vertices[bi][pi],
                texture
              )
              const keep: number[] = []
              for (let i = 0; i < faces.indices.length; i += 3) {
                if (
                  [0, 1, 2].every((v) => data.vertBoneBuffer[bi][pi][faces.indices[i + v]] === 42)
                )
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
                hiddenTextures?.some(
                  (name) =>
                    name.toLowerCase() === data.textures[mesh.userData.texture].name.toLowerCase()
                )
              ) &&
              !(
                readOnly &&
                stockModel &&
                weaponKey === 'xm1014' &&
                data.textures[mesh.userData.texture].name.toLowerCase() === 'shell.bmp'
              )
          })
        )
      )
      const container = createContainer(meshes, presentationRotation)
      scene.add(container)
      if (readOnly && stockModel && weaponKey === 'elite') {
        // Move complete pistol body parts, keeping their meshes aligned. These are
        // presentation transforms only; source geometry and sticker UVs stay intact.
        const pistols = meshes.flatMap((body, index) => {
          if (!/^weapon/i.test(data.bodyParts[index].name)) return []
          const visible = body.flat().filter((mesh) => mesh.visible)
          if (!visible.length) return []
          const bounds = new THREE.Box3()
          visible.forEach((mesh) => bounds.expandByObject(mesh))
          return [
            {
              meshes: visible,
              center: container.worldToLocal(bounds.getCenter(new THREE.Vector3()))
            }
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
        new THREE.Vector3(
          weaponKey === 'knife' && stockModel ? 1 : -1,
          readOnly ? 0 : 0.2,
          readOnly ? 0 : 0.35
        )
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
      if (highlightInspectionSide && readOnly) {
        tintInspectionSide(
          flat.filter((mesh) => mesh.visible),
          renderer,
          camera
        )
      }
      if (firstPerson && readOnly) {
        // Inspection offsets select the highlighted side; they never rotate the in-game pose.
        container.rotation.set(-Math.PI / 2, 0, -Math.PI / 2)
        container.position.set(0, 0, 0)
        container.updateMatrixWorld(true)
        meshes.forEach((body) =>
          body.forEach((part, pi) =>
            part.forEach((mesh) => {
              mesh.visible = pi === 0
            })
          )
        )
        element.style.transform = viewmodelNeedsMirror(data, 0, weaponKey ?? '') ? 'scaleX(-1)' : ''
        camera.fov = 65
        camera.position.set(0, 0, 0)
        camera.lookAt(new THREE.Vector3(0, 0, 100))
        camera.updateProjectionMatrix()
        controls.enabled = false
      }
      const raycaster = new THREE.Raycaster()
      let frame = 0,
        dirty = true,
        drag = false,
        initialPlacement = true
      resources.push(() => cancelAnimationFrame(frame))
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
      const resize = new ResizeObserver(() => {
        if (disposed) return
        try {
          resizeViewport()
        } catch (error) {
          fail(error)
        }
      })
      resources.push(() => resize.disconnect())
      resize.observe(element.parentElement!)
      // Keep the decoded model maps. Previewing must never quantize/export the model,
      // or dispose/reallocate every texture while the pointer moves.
      const baseMaps = flat.map((mesh) => (mesh.material as THREE.MeshBasicMaterial).map!)
      baseMaps.forEach((map) => ownedMaps.add(map))
      const previewMaps = new Map<number, THREE.DataTexture>()
      const update = () => {
        const state = useStickerEditor.getState()
        element.style.cursor = 'grab'
        const overrides = readOnly
          ? fullColorPreviewTextures.get(previewModel!)
          : state.atlas
            ? fullColorStickerTextures(state.atlas, [
                ...state.applied,
                ...(state.projection && state.sticker
                  ? [{ sticker: state.sticker, projection: state.projection }]
                  : [])
              ])
            : undefined
        const active = new Set<number>()
        for (const override of overrides ?? []) {
          active.add(override.texture)
          let map = previewMaps.get(override.texture)
          if (!map) {
            map = createTexture(override.rgba, override.width, override.height) as THREE.DataTexture
            previewMaps.set(override.texture, map)
            ownedMaps.add(map)
          } else {
            // DataTexture uploads use bottom-up rows, matching createTexture.
            const stride = override.width * 4
            for (let row = 0; row < override.height; row++)
              map.image.data.set(
                override.rgba.subarray(row * stride, (row + 1) * stride),
                (override.height - row - 1) * stride
              )
            map.needsUpdate = true
          }
        }
        flat.forEach((mesh, index) => {
          const material = mesh.material as THREE.MeshBasicMaterial
          const texture = mesh.userData.texture as number
          // Restore the unpainted map when dragging away from a page.
          material.map = active.has(texture) ? previewMaps.get(texture)! : baseMaps[index]
        })
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
      resources.push(unsubscribe)
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
        // Project from the inspection view instead of adopting a tiny bevel's normal.
        // Face-normal projection can turn a decal edge-on and smear it across nearby
        // surfaces when dragging over seams, rivets, or curved magazine geometry.
        const normal = camera.getWorldDirection(new THREE.Vector3()).negate()
        // Some authored GoldSrc meshes have inward triangle winding. Preserve its
        // signed side gate without adopting the bevel's projection angle.
        const faceNormal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
        if (normal.dot(faceNormal) < 0) normal.negate()
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion)
        right.addScaledVector(normal, -right.dot(normal)).normalize()
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion)
        up.addScaledVector(normal, -up.dot(normal))
          .addScaledVector(right, -up.dot(right))
          .normalize()
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
      let pendingPick: { clientX: number; clientY: number } | undefined
      const move = (event: PointerEvent) => {
        if (drag) pendingPick = { clientX: event.clientX, clientY: event.clientY }
      }
      const up = () => {
        // Commit the last move synchronously so Apply always uses the final position.
        if (pendingPick) pick(pendingPick)
        pendingPick = undefined
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
      resources.push(() => {
        element.removeEventListener('dragover', over)
        element.removeEventListener('drop', drop)
        element.removeEventListener('pointerdown', down)
        element.removeEventListener('pointermove', move)
        element.removeEventListener('pointerup', up)
        element.removeEventListener('pointercancel', up)
      })
      const contextLost = (event: Event) => {
        event.preventDefault()
        fail(new Error('WebGL context lost'))
      }
      element.addEventListener('webglcontextlost', contextLost)
      resources.push(() => element.removeEventListener('webglcontextlost', contextLost))
      update()
      const draw = () => {
        if (disposed) return
        try {
          frame = requestAnimationFrame(draw)
          if (pendingPick) {
            pick(pendingPick)
            pendingPick = undefined
          }
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
        } catch (error) {
          fail(error)
        }
      }
      draw()
    } catch (error) {
      fail(error)
    }
    return cleanup
  }, [
    model,
    previewModel,
    readOnly,
    stockModel,
    presentationRotation,
    hiddenTextures,
    weaponKey,
    onFirstFrame,
    onError,
    firstPerson,
    highlightInspectionSide
  ])
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
