import { STOCK_STICKER_MODELS, stockStickerModel } from '../../../../shared/stock-sticker-models'
import { create } from 'zustand'
import { toast } from 'react-toastify'
import type { OwnedSkin } from '../../../../shared/skins'
import type {
  OwnedSticker,
  StickerBuy,
  StickerCatalogItem,
  StickerSnapshot
} from '../../../../shared/stickers'
import type { StickerPixels } from '../../../../shared/sticker-model'
import { useAuthStore } from '../auth/auth.store'
import { useStickerEditor } from '../sticker-editor/sticker-editor.store'
import {
  bakeProjectedStickers,
  fullColorStickerTextures,
  fullColorPreviewTextures,
  prepareStickerAtlas
} from '../../libs/web-hlmv/lib/sticker-atlas'
import { inventoryText as t, type InventoryText } from './inventory-i18n'

export type WeaponTarget = { key: string; name: string; skinId?: string }
type InventoryState = {
  snapshot: StickerSnapshot | null
  weapons: OwnedSkin[]
  filter: 'all' | 'stickers' | 'consumables'
  loading: boolean
  error: boolean
  notice: { kind: 'pending' | 'success' | 'error'; key: InventoryText } | null
  pending: boolean
  purchase: { item: StickerCatalogItem; input: StickerBuy; attempted?: boolean } | null
  selectedSticker: OwnedSticker | null
  target: WeaponTarget | null
  editing: boolean
  images: Record<string, string>
  load: () => Promise<void>
  reload: () => Promise<void>
  selectPurchase: (item: StickerCatalogItem, currency?: 'POINTS' | 'P_CASH') => void
  buy: () => Promise<void>
  apply: () => Promise<void>
  selectSticker: (item: OwnedSticker) => void
  selectWeapon: (target: WeaponTarget) => void
  openEditor: () => Promise<void>
  close: () => void
}
let generation = 0
const purchaseIntents = new Map<string, StickerBuy>()
const imageCache = new Map<string, Promise<{ url: string; pixels: StickerPixels }>>()
async function imageData(path: string) {
  let promise = imageCache.get(path)
  if (!promise) {
    promise = (async () => {
      const bytes = await window.api.skins.stickerImage(path)
      const blob = new Blob([bytes], { type: 'image/png' })
      const bitmap = await createImageBitmap(blob)
      try {
        if (!bitmap.width || !bitmap.height || bitmap.width > 512 || bitmap.height > 512)
          throw new Error('STICKER_IMAGE_INVALID')
        const canvas = document.createElement('canvas')
        canvas.width = bitmap.width
        canvas.height = bitmap.height
        const context = canvas.getContext('2d')!
        context.drawImage(bitmap, 0, 0)
        const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height)
        return {
          url: canvas.toDataURL('image/png'),
          pixels: { width: bitmap.width, height: bitmap.height, rgba: new Uint8Array(pixels.data) }
        }
      } finally {
        bitmap.close()
      }
    })()
    imageCache.set(path, promise)
    promise.catch(() => imageCache.delete(path))
  }
  return promise
}
function errorKey(error: unknown): InventoryText {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('INSUFFICIENT')
    ? 'funds'
    : message.includes('PRICE_CHANGED')
      ? 'changed'
      : message.includes('LIMIT')
        ? 'limit'
        : message.includes('MODEL')
          ? 'modelError'
          : 'error'
}
async function feedback(action: () => Promise<void>) {
  const current = generation
  useInventoryStore.setState({ notice: { kind: 'pending', key: 'pending' } })
  const id = toast.loading(t('pending'), { closeButton: false, closeOnClick: false })
  try {
    await action()
    if (current !== generation) {
      toast.dismiss(id)
      return
    }
    useInventoryStore.setState({ notice: { kind: 'success', key: 'done' } })
    toast.update(id, {
      render: t('done'),
      type: 'success',
      isLoading: false,
      autoClose: 4000,
      closeButton: true
    })
  } catch (error) {
    if (current !== generation) {
      toast.dismiss(id)
      throw error
    }
    useInventoryStore.setState({ notice: { kind: 'error', key: errorKey(error) } })
    toast.update(id, {
      render: t(errorKey(error)),
      type: 'error',
      isLoading: false,
      autoClose: 8000,
      closeButton: true
    })
    throw error
  }
}
export const useInventoryStore = create<InventoryState>((set, get) => ({
  notice: null,
  snapshot: null,
  weapons: [],
  filter: 'all',
  loading: false,
  error: false,
  pending: false,
  purchase: null,
  selectedSticker: null,
  target: null,
  editing: false,
  images: {},
  load: async () => {
    const current = generation
    set({ loading: true, error: false })
    try {
      const [snapshot, weapons] = await Promise.all([
        window.api.skins.stickers(),
        window.api.skins.mine()
      ])
      if (current !== generation) return
      set({ snapshot, weapons, loading: false })
      // Decode only the bounded catalog/inventory images; failed artwork doesn't hide ownership.
      const paths = [
        ...new Set(
          [...snapshot.catalog, ...snapshot.items]
            .map((i) => i.imagePath)
            .filter((p): p is string => !!p)
        )
      ]
      for (let index = 0; index < paths.length; index += 4) {
        await Promise.all(
          paths.slice(index, index + 4).map(async (path) => {
            try {
              const image = await imageData(path)
              if (current === generation)
                set((s) => ({ images: { ...s.images, [path]: image.url } }))
            } catch {
              /* Item remains visible with its name and an empty artwork slot. */
            }
          })
        )
        if (current !== generation) return
      }
    } catch {
      if (current === generation) set({ loading: false, error: true })
    }
  },
  reload: async () => {
    if (get().pending || get().loading) return
    try {
      await feedback(async () => {
        await get().load()
        if (get().error) throw new Error('STICKER_LOAD_FAILED')
      })
    } catch {
      /* The toast and the existing retry panel carry the failure. */
    }
  },
  close: () => {
    if (get().pending) return
    set({ notice: null, selectedSticker: null, target: null, editing: false, purchase: null })
    useStickerEditor.setState({
      model: undefined,
      atlas: undefined,
      sticker: undefined,
      projection: undefined,
      applied: [],
      placed: false
    })
  },
  selectSticker: (selectedSticker) => {
    if (get().pending) return
    set({ notice: null, selectedSticker })
    if (get().target) void get().openEditor()
  },
  selectWeapon: (target) => {
    if (get().pending) return
    set({ notice: null, target })
    if (!get().snapshot) void get().reload()
    if (get().selectedSticker) void get().openEditor()
  },
  openEditor: async () => {
    const { target, selectedSticker, pending, snapshot } = get()
    if (!target || !selectedSticker || pending) return
    const current = generation
    set({ pending: true })
    try {
      await feedback(async () => {
        const attached =
          snapshot?.items
            .filter((i) => i.weaponKey === target.key)
            .sort(
              (a, b) =>
                (a.appliedAt ?? '').localeCompare(b.appliedAt ?? '') || a.id.localeCompare(b.id)
            ) ?? []
        if (attached.length >= 5) throw new Error('STICKER_LIMIT')
        const bytes = target.skinId
          ? await window.api.skins.previewModel(target.skinId, 'view')
          : await window.api.models.read(
              `v_${stockStickerModel(target.key.slice(6))?.model ?? 'invalid'}.mdl`
            )
        if (bytes.byteLength > 16 * 1024 * 1024) throw new Error('MODEL_UNSUPPORTED')
        const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')
        // Only verified stock binaries enter the legacy viewer parser.
        if (!Object.values(STOCK_STICKER_MODELS).some((entry) => entry.sha256 === hash))
          throw new Error('MODEL_UNSUPPORTED')
        const atlas = prepareStickerAtlas(new Uint8Array(bytes))
        const sticker = (await imageData(selectedSticker.imagePath)).pixels
        const applied = await Promise.all(
          attached.map(async (item) => ({
            sticker: (await imageData(item.imagePath)).pixels,
            projection: item.projection!
          }))
        )
        if (current !== generation) return
        useStickerEditor.setState({
          model: atlas.model,
          atlas,
          sticker,
          applied,
          placed: false,
          projection: undefined,
          busy: false,
          placement: { texture: 0, u: 0.5, v: 0.5, size: 0.18, angle: 0 }
        })
        set({ editing: true })
      })
    } catch {
      /* Feedback owns the actionable error. */
    } finally {
      if (current === generation) set({ pending: false })
    }
  },
  selectPurchase: (item, selectedCurrency) => {
    if (get().pending) return
    const retained = purchaseIntents.get(item.id)
    const currency =
      selectedCurrency ??
      (item.pricePoints === 0
        ? 'POINTS'
        : item.pricePCash === 0
          ? 'P_CASH'
          : item.pricePoints !== null
            ? 'POINTS'
            : 'P_CASH')
    const expectedPrice = currency === 'POINTS' ? item.pricePoints : item.pricePCash
    if (expectedPrice === null && !retained) return
    set({
      notice: null,
      purchase: {
        item,
        input: retained ?? {
          requestId: crypto.randomUUID(),
          currency,
          expectedPrice: expectedPrice!
        },
        attempted: !!retained
      }
    })
  },
  buy: async () => {
    const { purchase, pending } = get()
    if (!purchase || pending) return
    const current = generation
    set({ pending: true })
    try {
      await feedback(async () => {
        // Retain uncertain requests even when the dialog is closed/reopened.
        purchaseIntents.set(purchase.item.id, purchase.input)
        set({ purchase: { ...purchase, attempted: true } })
        try {
          await window.api.skins.stickerBuy(purchase.item.id, purchase.input)
        } catch (error) {
          if (
            current === generation &&
            error instanceof Error &&
            /INSUFFICIENT_|PRICE_CHANGED|STICKER_UNAVAILABLE/.test(error.message)
          ) {
            purchaseIntents.delete(purchase.item.id)
            if (current === generation) set({ purchase: { ...purchase, attempted: false } })
          }
          throw error
        }
        if (current !== generation) return
        purchaseIntents.delete(purchase.item.id)
        set({ purchase: null })
        await Promise.all([get().load(), useAuthStore.getState().refreshSession()])
      })
    } catch {
      /* Keep purchase for retry. */
    } finally {
      if (current === generation) set({ pending: false })
    }
  },
  apply: async () => {
    const { target, selectedSticker, pending } = get()
    const projection = useStickerEditor.getState().projection
    if (!target || !selectedSticker || !projection || pending) return
    const current = generation
    set({ pending: true })
    useStickerEditor.setState({ busy: true })
    try {
      await feedback(async () => {
        await window.api.skins.stickerApply(selectedSticker.id, target.key, projection)
        if (current !== generation) return
        set({ editing: false, selectedSticker: null, target: null })
        await get().load()
      })
    } catch {
      /* Keep the preview so the same application can be retried. */
    } finally {
      if (current === generation) {
        set({ pending: false })
        useStickerEditor.setState({ busy: false })
      }
    }
  }
}))
useAuthStore.subscribe((state, previous) => {
  if (state.session?.player.id === previous.session?.player.id) return
  generation++
  imageCache.clear()
  purchaseIntents.clear()
  useInventoryStore.setState({
    notice: null,
    snapshot: null,
    weapons: [],
    loading: false,
    error: false,
    pending: false,
    purchase: null,
    selectedSticker: null,
    target: null,
    editing: false,
    images: {}
  })
  useStickerEditor.setState({
    model: undefined,
    atlas: undefined,
    applied: [],
    sticker: undefined,
    projection: undefined,
    placed: false,
    busy: false
  })
})

/** Display-only preview; authoritative ownership and application remain on the backend. */
export async function previewAppliedStickers(
  bytes: ArrayBuffer,
  weaponKey: string
): Promise<ArrayBuffer> {
  if (!useInventoryStore.getState().snapshot) await useInventoryStore.getState().load()
  const snapshot = useInventoryStore.getState().snapshot
  if (!snapshot) throw new Error('STICKER_RESPONSE_INVALID')
  const applied = snapshot.items
    .filter((item) => item.weaponKey === weaponKey && item.projection && item.appliedAt)
    .sort((a, b) => a.appliedAt!.localeCompare(b.appliedAt!) || a.id.localeCompare(b.id))
  if (!applied.length) return bytes
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  if (!Object.values(STOCK_STICKER_MODELS).some((entry) => entry.sha256 === hash))
    throw new Error('MODEL_UNSUPPORTED')
  const atlas = prepareStickerAtlas(new Uint8Array(bytes))
  const layers = await Promise.all(
    applied.map(async (item) => ({
      sticker: (await imageData(item.imagePath)).pixels,
      projection: item.projection!
    }))
  )
  const output = bakeProjectedStickers(atlas, layers).slice().buffer as ArrayBuffer
  fullColorPreviewTextures.set(output, fullColorStickerTextures(atlas, layers))
  return output
}
