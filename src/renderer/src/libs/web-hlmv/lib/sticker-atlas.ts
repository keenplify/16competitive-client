/** Framework-free GoldSrc authoring used by both the editor and Electron main. */
import { parseModelCached } from './modelDataParser'
import { calcRotations } from './geometryTransformer'
import {
  bakeSticker,
  isHandTexture,
  modelTextures,
  texturePixels,
  type StickerPixels
} from '../../../../../shared/sticker-model'

type V3 = [number, number, number]
type Corner = [number, number, number, number]
export type Projection = { center: V3; right: V3; up: V3; normal: V3; size: number; angle: number }
export type AtlasFace = {
  texture: number
  uv: [number, number][]
  points: V3[]
  tile: [number, number, number, number]
}
export type StickerAtlas = { model: Uint8Array; faces: AtlasFace[]; extent: number }
const PAGE = 512,
  PAD = 2
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
]
const length = (a: V3) => Math.sqrt(dot(a, a))

/** GoldSrc walks each mesh's normal count through one shared, contiguous array.
 * A split mesh may reuse existing normal indices, but must not consume that array twice. */
export function validateStudioNormalLayout(bytes: Uint8Array): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const int = (at: number): number => {
    if (!Number.isInteger(at) || at < 0 || at + 4 > bytes.length) throw new Error('model')
    return view.getInt32(at, true)
  }
  const bodies = int(204),
    bodyOffset = int(208)
  if (bodies < 1 || bodies > 32) throw new Error('model')
  for (let b = 0; b < bodies; b++) {
    const body = bodyOffset + b * 76,
      parts = int(body + 64),
      partOffset = int(body + 72)
    if (parts < 1 || parts > 64) throw new Error('model')
    for (let p = 0; p < parts; p++) {
      const part = partOffset + p * 112,
        meshes = int(part + 72),
        meshOffset = int(part + 76),
        normals = int(part + 92)
      if (meshes < 1 || meshes > 256 || normals < 1 || normals > 2048) throw new Error('model')
      let consumed = 0
      for (let m = 0; m < meshes; m++) {
        const count = int(meshOffset + m * 20 + 12)
        if (count < 0 || consumed + count > normals) throw new Error('model')
        consumed += count
      }
      if (consumed !== normals) throw new Error('model')
    }
  }
}

/** Retail Mod_LoadStudioModel copies [0, texturedataindex), then reconstructs
 * contiguous texture pixels/palettes. Structural offsets must never enter that tail. */
export function validateStudioTextureLayout(bytes: Uint8Array): void {
  const textures = modelTextures(bytes),
    view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const boundary = view.getInt32(188, true)
  const range = (at: number, length: number): void => {
    if (
      !Number.isInteger(at) ||
      !Number.isInteger(length) ||
      at < 244 ||
      length < 0 ||
      at + length > boundary
    )
      throw new Error('model')
  }
  if (boundary < 244 || boundary > bytes.length) throw new Error('model')
  range(view.getInt32(184, true), textures.length * 80)
  range(view.getInt32(200, true), view.getInt32(192, true) * view.getInt32(196, true) * 2)
  let cursor = boundary
  for (const texture of textures) {
    if (texture.offset !== cursor) throw new Error('model')
    cursor += texture.width * texture.height + 768
  }
  if (cursor !== bytes.length) throw new Error('model')
  const bodies = view.getInt32(204, true),
    bodyOffset = view.getInt32(208, true)
  range(bodyOffset, bodies * 76)
  for (let b = 0; b < bodies; b++) {
    const body = bodyOffset + b * 76,
      parts = view.getInt32(body + 64, true),
      partOffset = view.getInt32(body + 72, true)
    range(partOffset, parts * 112)
    for (let p = 0; p < parts; p++) {
      const part = partOffset + p * 112,
        meshes = view.getInt32(part + 72, true),
        meshOffset = view.getInt32(part + 76, true),
        vertices = view.getInt32(part + 80, true),
        normals = view.getInt32(part + 92, true)
      range(meshOffset, meshes * 20)
      range(view.getInt32(part + 84, true), vertices)
      range(view.getInt32(part + 88, true), vertices * 12)
      range(view.getInt32(part + 96, true), normals)
      range(view.getInt32(part + 100, true), normals * 12)
      for (let m = 0; m < meshes; m++) {
        let command = view.getInt32(meshOffset + m * 20 + 4, true),
          budget = 0
        while (true) {
          range(command, 2)
          const count = Math.abs(view.getInt16(command, true))
          command += 2
          if (!count) break
          if (count < 3 || (budget += count) > 30000) throw new Error('model')
          range(command, count * 8)
          for (let i = 0; i < count; i++) {
            const v = view.getInt16(command + i * 8, true),
              n = view.getInt16(command + i * 8 + 2, true)
            if (v < 0 || v >= vertices || n < 0 || n >= normals) throw new Error('model')
          }
          command += count * 8
        }
      }
    }
  }
}

/** Bound allocation-driving tables before the legacy viewer parses catalog models. */
export function validateStickerSourceLayout(bytes: Uint8Array): void {
  modelTextures(bytes)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const int = (at: number): number => view.getInt32(at, true)
  const boundary = int(188)
  const table = (countAt: number, offsetAt: number, size: number, max: number): number => {
    const count = int(countAt),
      offset = int(offsetAt)
    if (
      count < 0 ||
      count > max ||
      (count > 0 && (offset < 244 || offset + count * size > boundary))
    )
      throw new Error('model')
    return count
  }
  const bones = table(140, 144, 112, 128),
    sequences = table(164, 168, 176, 256)
  if (!bones || !sequences || bones * sequences > 16384) throw new Error('model')
  table(148, 152, 24, 32)
  table(156, 160, 32, 256)
  if (table(172, 176, 104, 1) !== 1) throw new Error('model')
  table(212, 216, 88, 256)
  for (let b = 0; b < bones; b++) {
    const at = int(144) + b * 112,
      parent = int(at + 32)
    if (parent < -1 || parent >= b) throw new Error('model')
    for (let axis = 0; axis < 12; axis++)
      if (!Number.isFinite(view.getFloat32(at + 64 + axis * 4, true))) throw new Error('model')
  }
  for (let n = 0; n < sequences; n++) {
    const at = int(168) + n * 176,
      frames = int(at + 56),
      blends = int(at + 120),
      animation = int(at + 124)
    if (
      frames < 1 ||
      frames > 10000 ||
      blends < 1 ||
      blends > 9 ||
      int(at + 156) !== 0 ||
      animation < 244 ||
      animation + bones * blends * 12 > boundary
    )
      throw new Error('model')
  }
}

export function prepareStickerAtlas(input: Uint8Array, decodeTranslations = false): StickerAtlas {
  for (const density of [1, 0.5, 0.25, 0.125]) {
    try {
      return buildStickerAtlas(input, decodeTranslations, density)
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'atlas-capacity') throw error
    }
  }
  throw new Error('MODEL_UNSUPPORTED')
}
function buildStickerAtlas(
  input: Uint8Array,
  decodeTranslations: boolean,
  density: number
): StickerAtlas {
  validateStickerSourceLayout(input)
  validateStudioNormalLayout(input)
  validateStudioTextureLayout(input)
  const source = input.slice(),
    textures = modelTextures(source),
    view = new DataView(source.buffer)
  const model = parseModelCached(source.buffer),
    transforms = calcRotations(model, 0, 0, 0, decodeTranslations)
  if (model.header.numSkinFamilies !== 1) throw new Error('model')
  type Page = {
    original: number
    pixels: Uint8Array
    x: number
    y: number
    row: number
    offset: number
  }
  const pages: Page[] = [],
    faces: AtlasFace[] = []
  // GoldSrc copies only this structural prefix, then rewrites texture data
  // and palettes. New mesh commands/tables must be inside the new prefix.
  const originalTextureData = view.getInt32(188, true)
  if (originalTextureData < 244 || originalTextureData > source.length) throw new Error('model')
  const chunks: Uint8Array[] = [source.subarray(0, originalTextureData)]
  let end = originalTextureData
  const append = (bytes: Uint8Array): number => {
    const pad = (4 - (end % 4)) % 4
    if (pad) {
      chunks.push(new Uint8Array(pad))
      end += pad
    }
    const offset = end
    chunks.push(bytes)
    end += bytes.length
    if (end > 16 * 1024 * 1024) throw new Error('atlas-capacity')
    return offset
  }
  const allocate = (
    original: number,
    w: number,
    h: number
  ): { page: number; x: number; y: number } => {
    if (w > PAGE || h > PAGE) throw new Error('model')
    for (let i = 0; i <= pages.length; i++) {
      if (i === pages.length) {
        if (pages.length >= 32 || pages.length + textures.length >= 128)
          throw new Error('atlas-capacity')
        pages.push({
          original,
          pixels: new Uint8Array(PAGE * PAGE + 768),
          x: 0,
          y: 0,
          row: 0,
          offset: 0
        })
      }
      const p = pages[i]
      if (p.original !== original) continue
      if (p.x + w > PAGE) {
        p.x = 0
        p.y += p.row
        p.row = 0
      }
      if (p.y + h > PAGE) continue
      const x = p.x,
        y = p.y
      p.x += w
      p.row = Math.max(p.row, h)
      return { page: i, x, y }
    }
    throw new Error('model')
  }
  let min: V3 = [Infinity, Infinity, Infinity],
    max: V3 = [-Infinity, -Infinity, -Infinity]
  model.subModels.forEach((body, bi) =>
    body.forEach((part, pi) => {
      const records: Uint8Array[] = []
      model.meshes[bi][pi].forEach((mesh) => {
        const original = model.skinRef[mesh.skinRef],
          texture = textures[original]
        if (!texture) throw new Error('model')
        // Keep hands and environment-mapped/masked surfaces exactly as authored.
        if (texture.flags & (2 | 32 | 64) || isHandTexture(texture.name)) {
          const record = new Uint8Array(20),
            v = new DataView(record.buffer)
          ;[mesh.numTris, mesh.triIndex, mesh.skinRef, mesh.numNorms, mesh.normIndex].forEach(
            (n, i) => v.setInt32(i * 4, n, true)
          )
          records.push(record)
          return
        }
        const groups = new Map<number, Corner[][]>()
        let at = mesh.triIndex,
          triangleBudget = 0
        while (true) {
          if (at < 244 || at + 2 > source.length) throw new Error('model')
          const count = view.getInt16(at, true)
          at += 2
          if (!count) break
          const n = Math.abs(count)
          if (n < 3 || n > 10000 || at + n * 8 > source.length) throw new Error('model')
          const vertices: Corner[] = Array.from({ length: n }, () => {
            const c: Corner = [0, 0, 0, 0]
            for (let j = 0; j < 4; j++) {
              c[j] = view.getInt16(at, true)
              at += 2
            }
            return c
          })
          for (let j = 2; j < n; j++) {
            if (++triangleBudget > 10000) throw new Error('model')
            const tri =
              count < 0
                ? [vertices[0], vertices[j - 1], vertices[j]]
                : j % 2
                  ? [vertices[j - 1], vertices[j - 2], vertices[j]]
                  : [vertices[j - 2], vertices[j - 1], vertices[j]]
            const lowX = Math.min(...tri.map((v) => v[2])),
              lowY = Math.min(...tri.map((v) => v[3]))
            const spanX = Math.max(...tri.map((v) => v[2])) - lowX,
              spanY = Math.max(...tri.map((v) => v[3])) - lowY
            // Fit large authored UV spans in a bounded atlas page. Keep aspect ratio
            // and map sampling/triangle UVs through the same scale.
            const scale = Math.min(density, (PAGE - PAD * 2 - 1) / Math.max(1, spanX, spanY))
            const width = Math.ceil(spanX * scale) + 1 + PAD * 2,
              height = Math.ceil(spanY * scale) + 1 + PAD * 2
            const slot = allocate(original, width, height),
              page = pages[slot.page]
            for (let y = 0; y < height; y++)
              for (let x = 0; x < width; x++) {
                const sx = Math.max(
                    0,
                    Math.min(texture.width - 1, Math.round(lowX + (x - PAD) / scale))
                  ),
                  sy = Math.max(
                    0,
                    Math.min(texture.height - 1, Math.round(lowY + (y - PAD) / scale))
                  )
                page.pixels[(slot.y + y) * PAGE + slot.x + x] =
                  source[texture.offset + sy * texture.width + sx]
              }
            const remapped = tri.map(
              (c) =>
                [
                  c[0],
                  c[1],
                  Math.round((c[2] - lowX) * scale) + slot.x + PAD,
                  Math.round((c[3] - lowY) * scale) + slot.y + PAD
                ] as Corner
            )
            const points = tri.map((c) => {
              if (c[0] < 0 || c[0] >= part.numVerts || c[1] < 0 || c[1] >= part.numNorms)
                throw new Error('model')
              const t = transforms[model.vertBoneBuffer[bi][pi][c[0]]],
                p = model.vertices[bi][pi],
                i = c[0] * 3
              if (!t) throw new Error('model')
              const point: V3 = [
                t[0] * p[i] + t[4] * p[i + 1] + t[8] * p[i + 2] + t[12],
                t[1] * p[i] + t[5] * p[i + 1] + t[9] * p[i + 2] + t[13],
                t[2] * p[i] + t[6] * p[i + 1] + t[10] * p[i + 2] + t[14]
              ]
              min = min.map((v, i) => Math.min(v, point[i])) as V3
              max = max.map((v, i) => Math.max(v, point[i])) as V3
              return point
            })
            if (pi === 0)
              faces.push({
                texture: textures.length + slot.page,
                uv: remapped.map((c) => [c[2], c[3]]),
                points,
                tile: [slot.x, slot.y, width, height]
              })
            const list = groups.get(slot.page) ?? []
            list.push(remapped)
            groups.set(slot.page, list)
          }
        }
        let remainingNormals = mesh.numNorms
        for (const [page, list] of groups) {
          const commands = new Uint8Array(list.length * 26 + 2),
            cv = new DataView(commands.buffer)
          let index = 0
          for (const tri of list) {
            cv.setInt16(index, 3, true)
            index += 2
            for (const c of tri)
              for (const value of c) {
                cv.setInt16(index, value, true)
                index += 2
              }
          }
          const triOffset = append(commands),
            record = new Uint8Array(20),
            rv = new DataView(record.buffer)
          ;[
            list.length,
            triOffset,
            model.header.numSkinRef + page,
            // All page groups retain this source mesh's material flags and
            // normal indices. Light its shared normal block exactly once.
            remainingNormals,
            mesh.normIndex
          ].forEach((n, i) => rv.setInt32(i * 4, n, true))
          records.push(record)
          remainingNormals = 0
        }
      })
      const bytes = new Uint8Array(records.length * 20)
      records.forEach((record, i) => bytes.set(record, i * 20))
      const offset = append(bytes),
        submodel = model.bodyParts[bi].modelIndex + pi * 112
      view.setInt32(submodel + 72, records.length, true)
      view.setInt32(submodel + 76, offset, true)
    })
  )
  pages.forEach((page) => {
    const t = textures[page.original]
    page.pixels.set(
      source.subarray(t.offset + t.width * t.height, t.offset + t.width * t.height + 768),
      PAGE * PAGE
    )
  })
  const skinCount = model.header.numSkinRef + pages.length,
    skins = new Uint8Array(skinCount * 2),
    sv = new DataView(skins.buffer)
  for (let i = 0; i < model.header.numSkinRef; i++) sv.setInt16(i * 2, model.skinRef[i], true)
  pages.forEach((_, i) => sv.setInt16((model.header.numSkinRef + i) * 2, textures.length + i, true))
  const skinOffset = append(skins)
  const table = new Uint8Array((textures.length + pages.length) * 80),
    tv = new DataView(table.buffer)
  table.set(
    source.subarray(model.header.textureIndex, model.header.textureIndex + textures.length * 80)
  )
  pages.forEach((page, i) => {
    const at = (textures.length + i) * 80
    table.set(new TextEncoder().encode(`sticker_${i}.bmp`), at)
    ;[textures[page.original].flags, PAGE, PAGE, page.offset].forEach((n, j) =>
      tv.setInt32(at + 64 + j * 4, n, true)
    )
  })
  const textureOffset = append(table)
  const textureDataOffset = end
  // Disk pixels/palettes are contiguous in descriptor order. GoldSrc ignores
  // arbitrary gaps here while expanding 768-byte palettes in its cache.
  const rawTextures: Uint8Array[] = [
    ...textures.map((t) => source.subarray(t.offset, t.offset + t.width * t.height + 768)),
    ...pages.map((page) => page.pixels)
  ]
  rawTextures.forEach((pixels, i) => {
    tv.setInt32(i * 80 + 76, end, true)
    chunks.push(pixels)
    end += pixels.length
  })
  if (end > 16 * 1024 * 1024) throw new Error('atlas-capacity')
  view.setInt32(188, textureDataOffset, true)
  view.setInt32(72, end, true)
  view.setInt32(180, textures.length + pages.length, true)
  view.setInt32(184, textureOffset, true)
  view.setInt32(192, skinCount, true)
  view.setInt32(200, skinOffset, true)
  const output = new Uint8Array(end)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.length
  }
  modelTextures(output)
  validateStudioNormalLayout(output)
  validateStudioTextureLayout(output)
  return { model: output, faces, extent: length(sub(max, min)) }
}

export function validateProjection(value: unknown): Projection {
  if (!value || typeof value !== 'object') throw new Error('placement')
  const p = value as Projection
  for (const v of [p.center, p.right, p.up, p.normal])
    if (
      !Array.isArray(v) ||
      v.length !== 3 ||
      !v.every((n) => Number.isFinite(n) && Math.abs(n) < 10000)
    )
      throw new Error('placement')
  for (const axis of [p.right, p.up, p.normal])
    if (Math.abs(length(axis) - 1) > 0.01) throw new Error('placement')
  if (
    Math.abs(dot(p.right, p.up)) > 0.01 ||
    Math.abs(dot(p.right, p.normal)) > 0.01 ||
    Math.abs(dot(p.up, p.normal)) > 0.01 ||
    !Number.isFinite(p.size) ||
    p.size < 0.02 ||
    p.size > 0.65 ||
    !Number.isFinite(p.angle) ||
    Math.abs(p.angle) > 180
  )
    throw new Error('placement')
  return p
}

/** Project across mesh/material seams into unique face tiles, then quantize for GoldSrc. */
export function bakeProjectedSticker(
  atlas: StickerAtlas,
  sticker: StickerPixels,
  value: unknown
): Uint8Array {
  return bakeProjectedStickers(atlas, [{ sticker, projection: validateProjection(value) }])
}

/** Composite in application order, then quantize each texture exactly once. */
function projectedStickerLayers(
  atlas: StickerAtlas,
  placements: readonly { sticker: StickerPixels; projection: Projection }[]
): Map<number, Uint8Array> {
  if (placements.length > 5) throw new Error('placement')
  const overlays = new Map<number, Uint8Array>()
  for (const { sticker, projection } of placements) {
    const p = validateProjection(projection)
    if (
      !Number.isInteger(sticker.width) ||
      !Number.isInteger(sticker.height) ||
      sticker.width < 1 ||
      sticker.height < 1 ||
      sticker.width > 512 ||
      sticker.height > 512 ||
      sticker.rgba.length !== sticker.width * sticker.height * 4
    )
      throw new Error('image')
    const width = p.size * atlas.extent,
      height = (width * sticker.height) / sticker.width
    const angle = (p.angle * Math.PI) / 180,
      cos = Math.cos(angle),
      sin = Math.sin(angle)
    for (const face of atlas.faces) {
      const normal = cross(sub(face.points[1], face.points[0]), sub(face.points[2], face.points[0]))
      // Signed front-facing gate prevents the far side of a shared material receiving the decal.
      if (dot(normal, p.normal) / length(normal) < 0.15) continue
      const [a, b, c] = face.uv,
        den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
      if (Math.abs(den) < 0.001) continue
      const relative = face.points.map((point) => sub(point, p.center))
      const coordinates = relative.map((v) => [dot(v, p.right), dot(v, p.up), dot(v, p.normal)])
      if (
        coordinates.every((v) => v[2] > width * 0.7) ||
        coordinates.every((v) => v[2] < -width * 0.7)
      )
        continue
      const projected = coordinates.map((v) => [
        (v[0] * cos + v[1] * sin) / width,
        (-v[0] * sin + v[1] * cos) / height
      ])
      if (
        [0, 1].some(
          (axis) =>
            projected.every((v) => v[axis] < -0.55) || projected.every((v) => v[axis] > 0.55)
        )
      )
        continue
      const [tx, ty, tw, th] = face.tile
      for (let y = ty; y < ty + th; y++)
        for (let x = tx; x < tx + tw; x++) {
          const u = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / den
          const v = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / den,
            w = 1 - u - v
          const xyz = [0, 1, 2].map(
            (i) => coordinates[0][i] * u + coordinates[1][i] * v + coordinates[2][i] * w
          )
          if (Math.abs(xyz[2]) > width * 0.7) continue
          const sx = Math.floor(((xyz[0] * cos + xyz[1] * sin) / width + 0.5) * sticker.width)
          const sy = Math.floor((0.5 - (-xyz[0] * sin + xyz[1] * cos) / height) * sticker.height)
          if (sx < 0 || sy < 0 || sx >= sticker.width || sy >= sticker.height) continue
          const at = (sy * sticker.width + sx) * 4
          if (!sticker.rgba[at + 3]) continue
          let pixels = overlays.get(face.texture)
          if (!pixels) {
            pixels = new Uint8Array(PAGE * PAGE * 4)
            overlays.set(face.texture, pixels)
          }
          const destination = (y * PAGE + x) * 4
          const alpha = sticker.rgba[at + 3] / 255
          const previousAlpha = pixels[destination + 3] / 255
          const combined = alpha + previousAlpha * (1 - alpha)
          for (let channel = 0; channel < 3; channel++)
            pixels[destination + channel] = Math.round(
              (sticker.rgba[at + channel] * alpha +
                pixels[destination + channel] * previousAlpha * (1 - alpha)) /
                combined
            )
          pixels[destination + 3] = Math.round(combined * 255)
        }
    }
  }
  return overlays
}

export type FullColorStickerTexture = {
  texture: number
  width: number
  height: number
  rgba: Uint8ClampedArray
}

/** Keep original sticker colors; composite onto opaque weapon pixels without quantization. */
export function fullColorStickerTextures(
  atlas: StickerAtlas,
  placements: readonly { sticker: StickerPixels; projection: Projection }[]
): FullColorStickerTexture[] {
  const textures = modelTextures(atlas.model)
  return [...projectedStickerLayers(atlas, placements)].map(([texture, overlay]) => {
    const base = texturePixels(atlas.model, textures[texture])
    for (let i = 0; i < base.length; i += 4) {
      const alpha = overlay[i + 3] / 255
      for (let channel = 0; channel < 3; channel++)
        base[i + channel] = Math.round(
          overlay[i + channel] * alpha + base[i + channel] * (1 - alpha)
        )
      base[i + 3] = 255
    }
    return { texture, width: textures[texture].width, height: textures[texture].height, rgba: base }
  })
}

export function bakeProjectedStickers(
  atlas: StickerAtlas,
  placements: readonly { sticker: StickerPixels; projection: Projection }[]
): Uint8Array {
  const overlays = projectedStickerLayers(atlas, placements)
  let bytes = atlas.model
  for (const [texture, rgba] of overlays)
    bytes = bakeSticker(
      bytes,
      { width: PAGE, height: PAGE, rgba },
      { texture, u: 0.5, v: 0.5, size: 1, angle: 0 }
    )
  return bytes
}

/** Weak ownership keeps decoded preview pixels bounded to live model buffers. */
export const fullColorPreviewTextures = new WeakMap<ArrayBuffer, FullColorStickerTexture[]>()
