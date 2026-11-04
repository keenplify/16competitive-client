import type { Projection, StickerAtlas } from '../renderer/src/libs/web-hlmv/lib/sticker-atlas'
import type { StickerPixels } from './sticker-model'

export type EditorResult<T> =
  | { ok: true; value: T }
  | {
      ok: false
      error:
        | 'cancelled'
        | 'image'
        | 'model'
        | 'surface'
        | 'placement'
        | 'busy'
        | 'helper'
        | 'launch'
        | 'io'
    }
export type StickerEditorApi = {
  onGameExit: (listener: (failed: boolean) => void) => () => void
  load: () => Promise<EditorResult<{ atlas: StickerAtlas; sticker: StickerPixels }>>
  importSticker: () => Promise<EditorResult<StickerPixels>>
  exportModel: (placement: Projection) => Promise<EditorResult<string>>
  launch: (placement: Projection) => Promise<EditorResult<string>>
}
