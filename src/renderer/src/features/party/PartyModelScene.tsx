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
import {
  readCachedLobbyPresentation,
  writeCachedLobbyPresentation,
  type CachedLobbyPresentation
} from './lobby-model-cache'

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

type LoadedScene = {
  actorKey: string
  actors: PartySceneActor[]
  playerPresentations: CachedLobbyPresentation[]
  weaponBuffers: ArrayBuffer[]
}

const LOBBY_MODEL_PREFIX = 'lobby/'
const LOBBY_PRESENTATION_CACHE_REVISION = 1

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
    modelRotation: [0, 110, 90],
    handRotation: [0, 180, 0],
    handOffset: [21, 0, 0.5]
  },
  m4a1: {
    modelRotation: [0, -78, 90],
    handRotation: [0, 180, 0],
    handOffset: [11, 0, 2]
  },
  galil: {
    modelRotation: [0, 90, 90],
    handRotation: [0, 180, 0],
    handOffset: [21, 0, 4]
  },
  famas: {
    modelRotation: [0, 0, 180],
    handRotation: [0, 0, 0],
    handOffset: [9, 0, 1.5]
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
    modelRotation: [0, -75, 90],
    handRotation: [0, 180, 0],
    handOffset: [13, 0, 0.5]
  },
  scout: {
    modelRotation: [0, -75, 90],
    handRotation: [0, 180, 0],
    handOffset: [9, 0, 3]
  },
  g3sg1: {
    modelRotation: [0, -70, 90],
    handRotation: [0, 180, 0],
    handOffset: [10, 0, 1]
  },
  sg550: {
    modelRotation: [0, -90, 90],
    handRotation: [0, 180, 0],
    handOffset: [4, 0, 0.5]
  },
  mp5navy: {
    modelRotation: [0, -90, 90],
    handRotation: [0, 180, 90],
    handOffset: [-2, 0, 4]
  },
  tmp: {
    modelRotation: [0, 280, 90],
    handRotation: [0, 180, 0],
    handOffset: [3, -0.5, 1]
  },
  mac10: {
    modelRotation: [0, 280, 90],
    handRotation: [0, 180, 0],
    handOffset: [8, 1, 3]
  },
  ump45: {
    modelRotation: [0, -90, 90],
    handRotation: [0, 180, 0],
    handOffset: [2, -0.5, 0]
  },
  p90: {
    modelRotation: [0, -80, 90],
    handRotation: [0, 180, 0],
    handOffset: [0, 0, 4]
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
    modelRotation: [0, 270, 90],
    handRotation: [0, 180, 90],
    handOffset: [6, -0.5, 2.5]
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
    modelRotation: [0, -13, 90],
    handRotation: [90, 90, 90],
    handOffset: [4, -0.5, 3]
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

const LOBBY_SEQUENCE_BY_WEAPON: Record<string, string> = {
  usp: 'idle_pistol',
  glock18: 'idle_pistol',
  p228: 'idle_pistol',
  deagle: 'idle_pistol',
  fiveseven: 'idle_pistol',
  elite: 'idle_pistol',
  awp: 'idle_sniper',
  scout: 'idle_sniper',
  g3sg1: 'idle_sniper',
  sg550: 'idle_sniper',
  mp5navy: 'idle_smg',
  tmp: 'idle_smg',
  mac10: 'idle_smg',
  ump45: 'idle_smg',
  p90: 'idle_smg',
  knife: 'idle_knife'
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

const lobbyAnimationIndexFor = (modelData: ModelData, weaponKey: string): number => {
  const sequenceLabel = lobbySequenceLabelFor(weaponKey)
  const index = sequenceIndexFor(modelData, sequenceLabel)
  return index >= 0 ? index : weaponAnimationIndexFor(modelData, weaponKey)
}

const lobbySequenceLabelFor = (weaponKey: string): string =>
  LOBBY_SEQUENCE_BY_WEAPON[weaponKey] ?? 'idle_rifle'

const buildLobbyPresentation = (
  playerBuffer: ArrayBuffer,
  weaponKey: string
): CachedLobbyPresentation => {
  const player = parseModelCached(playerBuffer)
  const animationIndex = lobbyAnimationIndexFor(player, weaponKey)
  const activeSequence = player.sequences[animationIndex]
  const renderData = prepareRenderData(player, [animationIndex])
  const meshes = renderData.flatMap((bodyPart, bodyPartIndex) =>
    bodyPart.flatMap((subModel, subModelIndex) =>
      subModel.map(({ geometryBuffers, uvMap }, meshIndex) => {
        const sourceMesh = player.meshes[bodyPartIndex][subModelIndex][meshIndex]
        return {
          animationFrames: geometryBuffers[animationIndex].map(
            (frame) => new Float32Array(frame.array)
          ),
          uv: new Float32Array(uvMap.array),
          textureIndex: player.skinRef[sourceMesh.skinRef]
        }
      })
    )
  )

  return {
    fps: activeSequence?.fps ?? 0,
    frameCount: activeSequence?.numFrames ?? 0,
    boneNames: player.bones.map((bone) => bone.name.toLowerCase()),
    boneTransforms: Array.from({ length: activeSequence?.numFrames ?? 0 }, (_, frame) =>
      calcRotations(player, animationIndex, frame).map((matrix) => new Float32Array(matrix))
    ),
    meshes,
    textures: player.textures.map((texture) => ({
      pixels: buildTexture(playerBuffer, texture),
      width: texture.width,
      height: texture.height
    }))
  }
}

const loadPlayerPresentation = async (
  actor: PartySceneActor,
  weaponKey: string
): Promise<CachedLobbyPresentation> => {
  const cacheKey = `${LOBBY_PRESENTATION_CACHE_REVISION}:${actor.modelPath}:${lobbySequenceLabelFor(weaponKey)}`
  if (actor.modelPath.startsWith(LOBBY_MODEL_PREFIX)) {
    const cached = await readCachedLobbyPresentation(cacheKey)
    if (cached) return cached
    try {
      const playerBuffer = await window.api.models.read(actor.modelPath)
      const presentation = buildLobbyPresentation(playerBuffer, weaponKey)
      await writeCachedLobbyPresentation(cacheKey, presentation)
      return presentation
    } catch {
      // Fall through to the selected installation's stock model.
    }
  }

  const playerBuffer = await window.api.models.read(actor.fallbackModelPath)
  return buildLobbyPresentation(playerBuffer, weaponKey)
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

const DEFAULT_LOBBY_WEAPON_PATH = 'p_ak47.mdl'
const DEFAULT_LOBBY_WEAPON_KEY = 'ak47'

/** Keep the fallback model, animation, and transform on the same weapon. */
const loadLobbyWeapon = async (
  actor: PartySceneActor
): Promise<{ actor: PartySceneActor; weaponBuffer: ArrayBuffer }> => {
  try {
    return { actor, weaponBuffer: await window.api.models.read(actor.weaponPath) }
  } catch {
    const fallbackActor: PartySceneActor = {
      ...actor,
      weaponPath: DEFAULT_LOBBY_WEAPON_PATH,
      weaponKey: DEFAULT_LOBBY_WEAPON_KEY
    }
    return {
      actor: fallbackActor,
      weaponBuffer: await window.api.models.read(DEFAULT_LOBBY_WEAPON_PATH)
    }
  }
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

const roundedRectPath = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void => {
  const clampedRadius = Math.min(radius, width / 2, height / 2)
  context.beginPath()
  context.moveTo(x + clampedRadius, y)
  context.lineTo(x + width - clampedRadius, y)
  context.quadraticCurveTo(x + width, y, x + width, y + clampedRadius)
  context.lineTo(x + width, y + height - clampedRadius)
  context.quadraticCurveTo(x + width, y + height, x + width - clampedRadius, y + height)
  context.lineTo(x + clampedRadius, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - clampedRadius)
  context.lineTo(x, y + clampedRadius)
  context.quadraticCurveTo(x, y, x + clampedRadius, y)
  context.closePath()
}

const createNameplate = (actor: PartySceneActor): THREE.Sprite => {
  // Size each plate for its actual username. A fixed wide texture made short
  // names waste space, while changing just the sprite width distorts the text.
  const canvas = document.createElement('canvas')
  canvas.height = 256
  const context = canvas.getContext('2d')!
  const titleFontSize = 64
  const subtitleFontSize = 36
  const subtitle = `${actor.member.mmr} MMR${actor.isCurrentPlayer ? ' · YOU' : ''}`
  context.font = `700 ${titleFontSize}px sans-serif`
  const titleWidth = context.measureText(actor.member.username).width
  context.font = `600 ${subtitleFontSize}px sans-serif`
  const subtitleWidth = context.measureText(subtitle).width
  canvas.width = Math.ceil(Math.min(512, Math.max(420, Math.max(titleWidth, subtitleWidth) + 160)))

  const cardX = 24
  const cardY = 24
  const cardWidth = canvas.width - cardX * 2
  const cardHeight = canvas.height - cardY * 2

  roundedRectPath(context, cardX, cardY, cardWidth, cardHeight, 42)
  context.fillStyle = '#0b0f16'
  context.fill()
  context.lineWidth = 6
  context.strokeStyle = actor.isCurrentPlayer ? '#38bdf8' : '#525866'
  context.stroke()

  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillStyle = '#ffffff'
  context.font = `700 ${Math.min(titleFontSize, ((cardWidth - 48) / titleWidth) * titleFontSize)}px sans-serif`
  context.fillText(actor.member.username, canvas.width / 2, 100)

  context.fillStyle = '#cbd5e1'
  context.font = `600 ${Math.min(subtitleFontSize, ((cardWidth - 48) / subtitleWidth) * subtitleFontSize)}px sans-serif`
  context.fillText(subtitle, canvas.width / 2, 170)

  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.needsUpdate = true
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }))
  const height = 9.5
  sprite.scale.set((canvas.width / canvas.height) * height, height, 1)
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
  player: CachedLobbyPresentation,
  weaponBuffer: ArrayBuffer
): THREE.Group => {
  const presentationWeaponKey = weaponKeyFromPath(actor.weaponPath) ?? actor.weaponKey
  const weaponTransforms = weaponTransformsFor(presentationWeaponKey)
  const group = new THREE.Group()

  player.meshes.forEach(({ animationFrames, uv, textureIndex }) => {
    const texture = player.textures[textureIndex]
    const frameAttributes = animationFrames.map((frame) => new THREE.BufferAttribute(frame, 3))
    const mesh = addMesh(
      group,
      frameAttributes[0],
      new THREE.BufferAttribute(uv, 2),
      texture?.pixels,
      texture
    )
    mesh.userData.animationFrames = frameAttributes
  })

  const weapon = parseModelCached(weaponBuffer)
  const weaponTextures = weapon.textures.map((texture) => buildTexture(weaponBuffer, texture))
  const playerBoneIndices = new Map(player.boneNames.map((boneName, index) => [boneName, index]))
  const rightHandBone = player.boneNames.findIndex((boneName) => boneName.includes('r hand'))
  const leftHandBone = player.boneNames.findIndex((boneName) => boneName.includes('l hand'))

  weaponTransforms.forEach((weaponTransform) => {
    const requestedHandBone = weaponTransform.hand === 'left' ? leftHandBone : rightHandBone
    const handBone = requestedHandBone >= 0 ? requestedHandBone : rightHandBone
    const sourceRotation = new THREE.Matrix4().makeRotationFromEuler(
      new THREE.Euler(
        ...weaponTransform.modelRotation.map((degrees) => THREE.Math.degToRad(degrees))
      )
    )
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
          const animationFrames = player.boneTransforms.map((playerBones) => {
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
            return new THREE.BufferAttribute(skinned, 3)
          })
          const mesh = addMesh(
            group,
            animationFrames[0] ?? new THREE.BufferAttribute(positioned, 3),
            new THREE.BufferAttribute(uv, 2),
            weaponTextures[textureIndex],
            textureInfo
          )
          mesh.userData.animationFrames = animationFrames
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
  group.userData.animationFps = player.fps
  group.userData.animationFrameCount = player.frameCount
  group.userData.animationStartedAt = performance.now()
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
  const [loadedScene, setLoadedScene] = useState<LoadedScene | null>(null)
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
    const loadKey = actorKey
    const actorsSnapshot = [...actorsRef.current]
    void Promise.all(
      actorsSnapshot.map(async (actor) => {
        const loadedWeapon = await loadLobbyWeapon(actor)
        const presentationWeaponKey =
          weaponKeyFromPath(loadedWeapon.actor.weaponPath) ?? loadedWeapon.actor.weaponKey
        const playerPresentation = await loadPlayerPresentation(
          loadedWeapon.actor,
          presentationWeaponKey
        )
        return {
          actor: loadedWeapon.actor,
          playerPresentation,
          weaponBuffer: loadedWeapon.weaponBuffer
        }
      })
    )
      .then((loaded) => {
        if (!active) return
        setLoadedScene({
          actorKey: loadKey,
          actors: loaded.map(({ actor }) => actor),
          playerPresentations: loaded.map(({ playerPresentation }) => playerPresentation),
          weaponBuffers: loaded.map(({ weaponBuffer }) => weaponBuffer)
        })
      })
      .catch((error: unknown) => console.error('[Lobby] Could not load party scene models', error))
    return () => {
      active = false
    }
  }, [actorKey, sourceRevision])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !loadedScene || loadedScene.actorKey !== actorKey) return
    if (loadedScene.playerPresentations.length !== loadedScene.actors.length) return
    if (loadedScene.weaponBuffers.length !== loadedScene.actors.length) return
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 2000)
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    const ambient = new THREE.AmbientLight(0xffffff, 1.2)
    scene.add(ambient)
    const sceneActors = loadedScene.actors
    const formation = [
      { x: 0, z: 24 },
      { x: 31, z: 2 },
      { x: -31, z: 2 },
      { x: 60, z: -20 },
      { x: -60, z: -20 }
    ] as const
    const actorsToFade: THREE.Group[] = []
    sceneActors.forEach((actor, index) => {
      const playerPresentation = loadedScene.playerPresentations[index]
      const weaponBuffer = loadedScene.weaponBuffers[index]
      if (!playerPresentation || !weaponBuffer) return
      const model = createActor(actor, playerPresentation, weaponBuffer)
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
      // targetCameraX = 90
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
      const now = performance.now()
      actorsToFade.forEach((actor) => {
        setActorOpacity(actor, opacity)
        const fps = actor.userData.animationFps as number
        const frameCount = actor.userData.animationFrameCount as number
        if (fps <= 0 || frameCount <= 0) return
        const sequenceTime = ((now - (actor.userData.animationStartedAt as number)) / 1000) * fps
        const frame = Math.floor(sequenceTime) % frameCount
        const nextFrame = (frame + 1) % frameCount
        const frameProgress = sequenceTime - Math.floor(sequenceTime)
        actor.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return
          const frames = object.userData.animationFrames as THREE.BufferAttribute[] | undefined
          const position = (object.geometry as THREE.BufferGeometry).getAttribute('position') as
            THREE.BufferAttribute | undefined
          const sourcePosition = frames?.[frame]
          const nextPosition = frames?.[nextFrame]
          if (!sourcePosition || !nextPosition || !position) return
          const target = position.array as Float32Array
          const current = sourcePosition.array as ArrayLike<number>
          const next = nextPosition.array as ArrayLike<number>
          for (let index = 0; index < target.length; index++) {
            target[index] = current[index] + (next[index] - current[index]) * frameProgress
          }
          position.needsUpdate = true
        })
      })
      renderer.render(scene, camera)
    }
    render()
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', handlePointerMove)
      observer.disconnect()
      renderer.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actorKey, loadedScene, HOT_RENDER_REVISION])

  return <canvas ref={canvasRef} className={className} aria-label="Party model scene" />
}
