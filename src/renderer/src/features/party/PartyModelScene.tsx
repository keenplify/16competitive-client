import { useEffect, useRef, useState, type JSX } from 'react'
import THREE from '../../libs/web-hlmv/lib/three'
import { parseModelCached, type ModelData } from '../../libs/web-hlmv/lib/modelDataParser'
import { buildTexture } from '../../libs/web-hlmv/lib/textureBuilder'
import {
  applyBoneTransforms,
  createTexture,
  prepareRenderData
} from '../../libs/web-hlmv/lib/modelRenderer'
import { readFacesData } from '../../libs/web-hlmv/lib/geometryBuilder'
import { calcRotations } from '../../libs/web-hlmv/lib/geometryTransformer'
import type { PartyMember } from '../../../../shared/party'

export type PartySceneActor = {
  member: PartyMember
  modelPath: string
  fallbackModelPath: string
  weaponPath: string
  weaponKey: string
  isLeader: boolean
  isCurrentPlayer: boolean
}

type WeaponHand = 'left' | 'right'

type WeaponTransform = {
  hand?: WeaponHand
  modelRotation: readonly [number, number, number]
  handRotation: readonly [number, number, number]
  handOffset: readonly [number, number, number]
}

const DEFAULT_WEAPON_TRANSFORM: WeaponTransform = {
  modelRotation: [0, 90, 90],
  handRotation: [0, 180, 0],
  handOffset: [21, 0, 4]
}

// Weapon placement is intentionally independent from animation families so each
// p_*.mdl can be calibrated without changing other guns that share ref_aim_*.
// A weapon may provide multiple transforms when it needs multiple model instances.
const WEAPON_TRANSFORM: Record<string, WeaponTransform | readonly WeaponTransform[]> = {
  ak47: {
    modelRotation: [0, 90, 90],
    handRotation: [0, 180, 0],
    handOffset: [21, 0, 4]
  },
  m4a1: {
    modelRotation: [0, -90, 90],
    handRotation: [0, 180, 0],
    handOffset: [15, 0, 3.5]
  },
  galil: {
    modelRotation: [0, 90, 90],
    handRotation: [0, 180, 0],
    handOffset: [21, 0, 4]
  },
  famas: {
    modelRotation: [0, 0, 180],
    handRotation: [0, 0, 0],
    handOffset: [15, 0, 1.5]
  },
  aug: {
    modelRotation: [90, 0, 0],
    handRotation: [0, 0, 0],
    handOffset: [2, 0, 1.5]
  },
  sg552: {
    modelRotation: [0, 90, 90],
    handRotation: [0, 180, 0],
    handOffset: [21, 0, 4]
  },
  awp: {
    modelRotation: [0, -90, 90],
    handRotation: [0, 180, 0],
    handOffset: [15, 0, 3.5]
  },
  scout: {
    modelRotation: [0, -90, 90],
    handRotation: [0, 180, 0],
    handOffset: [15, 0, 3.5]
  },
  g3sg1: {
    modelRotation: [0, -90, 90],
    handRotation: [0, 180, 0],
    handOffset: [15, 0, 3.5]
  },
  sg550: {
    modelRotation: [0, -90, 90],
    handRotation: [0, 180, 0],
    handOffset: [15, 0, 3.5]
  },
  mp5navy: {
    modelRotation: [0, -90, 90],
    handRotation: [0, 180, 90],
    handOffset: [0, 0, 4]
  },
  tmp: {
    modelRotation: [0, 280, 90],
    handRotation: [0, 180, 0],
    handOffset: [1, 1, 1]
  },
  mac10: {
    modelRotation: [0, 280, 90],
    handRotation: [0, 180, 0],
    handOffset: [8, 1, 3]
  },
  ump45: {
    modelRotation: [0, -90, 90],
    handRotation: [0, 180, 0],
    handOffset: [2, -1, 3]
  },
  p90: {
    modelRotation: [0, -90, 90],
    handRotation: [0, 180, 0],
    handOffset: [2, -1, 3]
  },
  usp: {
    modelRotation: [0, 290, 90],
    handRotation: [0, 180, 0],
    handOffset: [7, 1, 2]
  },
  glock18: {
    modelRotation: [0, 290, 90],
    handRotation: [0, 180, 0],
    handOffset: [4, 0.5, 2]
  },
  p228: {
    modelRotation: [0, 280, 90],
    handRotation: [0, 180, 0],
    handOffset: [4, 1, 3]
  },
  deagle: {
    modelRotation: [0, 280, 90],
    handRotation: [0, 180, 0],
    handOffset: [4, 1, 3]
  },
  fiveseven: {
    modelRotation: [0, 280, 90],
    handRotation: [0, 180, 0],
    handOffset: [3, 1, 3]
  },
  elite: [
    {
      hand: 'right',
      modelRotation: [-90, 180, 0],
      handRotation: [0, 180, 0],
      handOffset: [5, 0, 3.5]
    },
    {
      hand: 'left',
      modelRotation: [90, 180, 0],
      handRotation: [0, 180, 0],
      handOffset: [5, -1, -3.5]
    }
  ],
  m3: {
    modelRotation: [0, 90, 90],
    handRotation: [0, 180, 0],
    handOffset: [21, 0, 4]
  },
  xm1014: {
    modelRotation: [0, 90, 90],
    handRotation: [0, 180, 0],
    handOffset: [21, 0, 4]
  },
  m249: {
    modelRotation: [90, 0, 90],
    handRotation: [0, 90, 0],
    handOffset: [1, 2.5, 4]
  },
  knife: {
    modelRotation: [0, 90, 90],
    handRotation: [0, 180, 0],
    handOffset: [2, 1, 1]
  },
  c4: {
    modelRotation: [0, 90, 90],
    handRotation: [0, 180, 0],
    handOffset: [21, 0, 4]
  },
  hegrenade: {
    modelRotation: [0, 90, 90],
    handRotation: [0, 180, 0],
    handOffset: [21, 0, 4]
  },
  flashbang: {
    modelRotation: [0, 90, 90],
    handRotation: [0, 180, 0],
    handOffset: [21, 0, 4]
  },
  smokegrenade: {
    modelRotation: [0, 90, 90],
    handRotation: [0, 180, 0],
    handOffset: [21, 0, 4]
  }
}

const WEAPON_ANIMATION_FAMILY: Record<string, string> = {
  usp: 'onehanded',
  glock18: 'onehanded',
  p228: 'onehanded',
  deagle: 'onehanded',
  fiveseven: 'onehanded',
  tmp: 'onehanded',
  mac10: 'onehanded',
  elite: 'dualpistols',
  mp5navy: 'mp5',
  sg552: 'mp5',
  g3sg1: 'mp5',
  p90: 'carbine',
  ump45: 'carbine',
  aug: 'carbine',
  famas: 'carbine',
  m4a1: 'rifle',
  awp: 'rifle',
  scout: 'rifle',
  sg550: 'rifle',
  ak47: 'ak47',
  galil: 'ak47',
  m249: 'm249',
  knife: 'knife'
}

const HOT_RENDER_REVISION = import.meta.hot
  ? ((import.meta.hot.data.partyModelSceneRevision as number | undefined) ?? 0) + 1
  : 0

if (import.meta.hot) {
  import.meta.hot.data.partyModelSceneRevision = HOT_RENDER_REVISION
}

const sequenceIndexFor = (modelData: ModelData, label: string): number =>
  modelData.sequences.findIndex((sequence) => sequence.label.toLowerCase() === label)

const idleSequenceIndexFor = (modelData: ModelData): number => {
  const idle1 = sequenceIndexFor(modelData, 'idle1')
  if (idle1 >= 0) return idle1
  const idle = sequenceIndexFor(modelData, 'idle')
  return idle >= 0 ? idle : 0
}

const weaponAnimationIndexFor = (modelData: ModelData, weaponKey: string): number => {
  const family = WEAPON_ANIMATION_FAMILY[weaponKey]
  if (family) {
    const index = sequenceIndexFor(modelData, `ref_aim_${family}`)
    if (index >= 0) return index
  }
  return idleSequenceIndexFor(modelData)
}

const isWeaponTransformArray = (
  value: WeaponTransform | readonly WeaponTransform[]
): value is readonly WeaponTransform[] => Array.isArray(value)

const weaponTransformsFor = (weaponKey: string): readonly WeaponTransform[] => {
  const configured = WEAPON_TRANSFORM[weaponKey] ?? DEFAULT_WEAPON_TRANSFORM

  return isWeaponTransformArray(configured) ? configured : [configured]
}

const weaponKeyFromPath = (weaponPath: string): string | null => {
  const normalized = weaponPath.replace(/\\/g, '/').toLowerCase()
  const customMatch = normalized.match(/(?:^|\/)models\/16competitive\/([^/]+)\//)
  if (customMatch?.[1]) return customMatch[1]

  const stockMatch = normalized.match(/(?:^|\/)p_([^/]+)\.mdl$/)
  if (!stockMatch?.[1]) return null
  return stockMatch[1] === 'mp5' ? 'mp5navy' : stockMatch[1]
}

const addMesh = (
  group: THREE.Group,
  positions: THREE.BufferAttribute,
  uv: THREE.BufferAttribute,
  texture: Uint8ClampedArray | undefined,
  textureInfo: { width: number; height: number } | undefined
): THREE.Mesh => {
  const geometry = new THREE.BufferGeometry()
  geometry.addAttribute('position', new THREE.BufferAttribute(new Float32Array(positions.array), 3))
  geometry.addAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv.array), 2))
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
    transparent: true,
    alphaTest: 0.5
  })
  if (texture && textureInfo)
    material.map = createTexture(texture, textureInfo.width, textureInfo.height)
  const mesh = new THREE.Mesh(geometry, material)
  group.add(mesh)
  return mesh
}

const createNameplate = (actor: PartySceneActor): THREE.Sprite => {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 112
  const context = canvas.getContext('2d')!
  context.textAlign = 'center'
  context.font = '700 34px sans-serif'
  context.lineWidth = 7
  context.lineJoin = 'round'
  context.lineCap = 'round'
  context.strokeStyle = 'rgba(0, 0, 0, 0.9)'
  context.strokeText(actor.member.username, 256, 44)
  context.fillStyle = '#ffffff'
  context.fillText(actor.member.username, 256, 44)
  context.font = '600 20px sans-serif'
  context.lineWidth = 4
  context.fillStyle = 'rgba(220, 230, 240, 0.95)'
  context.strokeText(`${actor.member.mmr} MMR${actor.isCurrentPlayer ? ' · YOU' : ''}`, 256, 81)
  context.fillText(`${actor.member.mmr} MMR${actor.isCurrentPlayer ? ' · YOU' : ''}`, 256, 81)
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true })
  )
  sprite.scale.set(38, 8.3, 1)
  return sprite
}

const setActorOpacity = (actor: THREE.Group, opacity: number): void => {
  actor.traverse((object) => {
    if (!(object instanceof THREE.Mesh) && !(object instanceof THREE.Sprite)) return
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    materials.forEach((material) => {
      material.transparent = true
      material.opacity = opacity
    })
  })
}

const createActor = (
  actor: PartySceneActor,
  playerBuffer: ArrayBuffer,
  weaponBuffer: ArrayBuffer
): THREE.Group => {
  const player = parseModelCached(playerBuffer)
  const presentationWeaponKey = weaponKeyFromPath(actor.weaponPath) ?? actor.weaponKey
  const animationIndex = weaponAnimationIndexFor(player, presentationWeaponKey)
  const weaponTransforms = weaponTransformsFor(presentationWeaponKey)
  const renderData = prepareRenderData(player, [animationIndex])
  const playerTextures = player.textures.map((texture) => buildTexture(playerBuffer, texture))
  const group = new THREE.Group()

  renderData.forEach((bodyPart, bodyPartIndex) =>
    bodyPart.forEach((subModel, subModelIndex) =>
      subModel.forEach(({ geometryBuffers, uvMap }, meshIndex) => {
        const sourceMesh = player.meshes[bodyPartIndex][subModelIndex][meshIndex]
        const textureIndex = player.skinRef[sourceMesh.skinRef]
        addMesh(
          group,
          geometryBuffers[animationIndex][0],
          uvMap,
          playerTextures[textureIndex],
          player.textures[textureIndex]
        )
      })
    )
  )

  const weapon = parseModelCached(weaponBuffer)
  const weaponTextures = weapon.textures.map((texture) => buildTexture(weaponBuffer, texture))
  const playerBoneIndices = new Map(
    player.bones.map((bone, index) => [bone.name.toLowerCase(), index])
  )
  const rightHandBone = player.bones.findIndex((bone) => bone.name.toLowerCase().includes('r hand'))
  const leftHandBone = player.bones.findIndex((bone) => bone.name.toLowerCase().includes('l hand'))
  const playerBones = calcRotations(player, animationIndex, 0)

  weaponTransforms.forEach((weaponTransform) => {
    const requestedHandBone = weaponTransform.hand === 'left' ? leftHandBone : rightHandBone
    const handBone = requestedHandBone >= 0 ? requestedHandBone : rightHandBone
    const sourceRotation = new THREE.Matrix4().makeRotationFromEuler(
      new THREE.Euler(
        ...weaponTransform.modelRotation.map((degrees) => THREE.Math.degToRad(degrees))
      )
    )
    const handTransform = new THREE.Matrix4().fromArray(
      playerBones[handBone] as unknown as number[]
    )
    const handRotation = handTransform
      .clone()
      .multiply(
        new THREE.Matrix4().makeRotationFromEuler(
          new THREE.Euler(
            ...weaponTransform.handRotation.map((degrees) => THREE.Math.degToRad(degrees))
          )
        )
      )
      .multiply(new THREE.Matrix4().getInverse(handTransform))
    const handOrigin = new THREE.Vector3().setFromMatrixPosition(handTransform)
    const handOffset = new THREE.Vector3(...weaponTransform.handOffset)
      .applyMatrix4(handTransform)
      .sub(handOrigin)
    const weaponBoneMap = weapon.bones.map((bone) =>
      weaponTransform.hand ? handBone : (playerBoneIndices.get(bone.name.toLowerCase()) ?? handBone)
    )

    weapon.meshes.forEach((bodyPart, bodyPartIndex) =>
      bodyPart.forEach((subModel, subModelIndex) =>
        subModel.forEach((sourceMesh, meshIndex) => {
          const textureIndex = weapon.skinRef[sourceMesh.skinRef]
          const textureInfo = weapon.textures[textureIndex]
          const { vertices, uv, indices } = readFacesData(
            weapon.triangles[bodyPartIndex][subModelIndex][meshIndex],
            weapon.vertices[bodyPartIndex][subModelIndex],
            textureInfo ?? { width: 1, height: 1 }
          )
          const positioned = new Float32Array(vertices.length)
          for (let index = 0; index < vertices.length; index += 3) {
            const vertex = new THREE.Vector3(
              vertices[index],
              vertices[index + 1],
              vertices[index + 2]
            ).applyMatrix4(sourceRotation)
            positioned[index] = vertex.x
            positioned[index + 1] = vertex.y
            positioned[index + 2] = vertex.z
          }
          const boneBuffer = Uint8Array.from(
            weapon.vertBoneBuffer[bodyPartIndex][subModelIndex],
            (boneIndex) => weaponBoneMap[boneIndex] ?? handBone
          )
          const skinned = applyBoneTransforms(positioned, indices, boneBuffer, playerBones)
          for (let index = 0; index < skinned.length; index += 3) {
            const vertex = new THREE.Vector3(
              skinned[index],
              skinned[index + 1],
              skinned[index + 2]
            ).applyMatrix4(handRotation)
            skinned[index] = vertex.x + handOffset.x
            skinned[index + 1] = vertex.y + handOffset.y
            skinned[index + 2] = vertex.z + handOffset.z
          }
          addMesh(
            group,
            new THREE.BufferAttribute(skinned, 3),
            new THREE.BufferAttribute(uv, 2),
            weaponTextures[textureIndex],
            textureInfo
          )
        })
      )
    )
  })

  group.rotation.x = THREE.Math.degToRad(-90)
  group.rotation.z = THREE.Math.degToRad(-90)
  group.updateMatrixWorld(true)
  const bounds = new THREE.Box3().setFromObject(group)
  group.position.y = (bounds.min.y - bounds.max.y) / 2
  group.updateMatrixWorld(true)
  const nameplate = createNameplate(actor)
  const centeredBounds = new THREE.Box3().setFromObject(group)
  const nameplatePosition = centeredBounds
    .getCenter(new THREE.Vector3())
    .setY(centeredBounds.max.y + 8)
  group.worldToLocal(nameplatePosition)
  nameplate.position.copy(nameplatePosition)
  group.add(nameplate)
  return group
}

interface PartyModelSceneProps {
  actors: PartySceneActor[]
  sourceRevision?: string | number
  className?: string
}

export function PartyModelScene({
  actors,
  sourceRevision,
  className
}: PartyModelSceneProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const actorsRef = useRef(actors)
  const [buffers, setBuffers] = useState<ArrayBuffer[] | null>(null)
  const actorKey = actors
    .map(
      ({ member, modelPath, weaponPath, weaponKey, isCurrentPlayer, isLeader }) =>
        `${member.id}:${member.username}:${member.mmr}:${modelPath}:${weaponPath}:${weaponKey}:${isLeader}:${isCurrentPlayer}`
    )
    .join('|')

  useEffect(() => {
    actorsRef.current = actors
  }, [actors])

  useEffect(() => {
    let active = true
    void Promise.all([
      ...actorsRef.current.flatMap((actor) => [
        window.api.models
          .read(actor.modelPath)
          .catch(() => window.api.models.read(actor.fallbackModelPath)),
        window.api.models.read(actor.weaponPath).catch(() => window.api.models.read('p_ak47.mdl'))
      ])
    ])
      .then((loaded) => active && setBuffers(loaded))
      .catch((error: unknown) => console.error('[Lobby] Could not load party scene models', error))
    return () => {
      active = false
    }
  }, [actorKey, sourceRevision])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !buffers) return
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 2000)
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    const ambient = new THREE.AmbientLight(0xffffff, 1.2)
    scene.add(ambient)
    const sceneActors = actorsRef.current
    const formation = [
      { x: 0, z: 24 },
      { x: 31, z: 2 },
      { x: -31, z: 2 },
      { x: 60, z: -20 },
      { x: -60, z: -20 }
    ] as const
    const actorsToFade: THREE.Group[] = []
    sceneActors.forEach((actor, index) => {
      const model = createActor(actor, buffers[index * 2], buffers[index * 2 + 1])
      setActorOpacity(model, 0)
      // GoldSrc player MDLs do not share a consistent local origin. Center a
      // solo actor from its actual geometry while leaving the tuned five-player
      // formation exactly as-is.
      model.position.x = formation[index]?.x
      model.position.y = -45
      model.position.z = formation[index]?.z ?? 2
      scene.add(model)
      actorsToFade.push(model)
    })
    camera.position.set(0, 22.5, 170)
    camera.lookAt(new THREE.Vector3(0, 0, 0))
    let targetCameraX = 0
    const handlePointerMove = (event: PointerEvent): void => {
      const bounds = canvas.getBoundingClientRect()
      if (bounds.width <= 0) return
      const normalizedX = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width))
      targetCameraX = -11.25 + normalizedX * 22.5
    }
    window.addEventListener('pointermove', handlePointerMove)
    const resize = () => {
      const bounds = canvas.getBoundingClientRect()
      camera.aspect = bounds.width / bounds.height
      camera.updateProjectionMatrix()
      renderer.setSize(bounds.width, bounds.height, false)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()
    let frame = 0
    const fadeStartedAt = performance.now()
    const render = () => {
      frame = requestAnimationFrame(render)
      camera.position.x += (targetCameraX - camera.position.x) * 0.06
      camera.lookAt(new THREE.Vector3(0, 0, 0))
      const opacity = Math.min((performance.now() - fadeStartedAt) / 450, 1)
      actorsToFade.forEach((actor) => setActorOpacity(actor, opacity))
      renderer.render(scene, camera)
    }
    render()
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', handlePointerMove)
      observer.disconnect()
      renderer.dispose()
    }
  }, [actorKey, buffers, HOT_RENDER_REVISION])

  return <canvas ref={canvasRef} className={className} aria-label="Party model scene" />
}
