import { contextBridge, ipcRenderer } from 'electron'
import type { StickerEditorApi } from '../../src/shared/sticker-editor'

const api: StickerEditorApi = {
  onGameExit: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, failed: unknown): void =>
      listener(failed === true)
    ipcRenderer.on('sticker:game-exit', handler)
    return () => ipcRenderer.removeListener('sticker:game-exit', handler)
  },
  load: () => ipcRenderer.invoke('sticker:load'),
  importSticker: () => ipcRenderer.invoke('sticker:import'),
  exportModel: (placement) => ipcRenderer.invoke('sticker:export', placement),
  launch: (placement) => ipcRenderer.invoke('sticker:launch', placement)
}
contextBridge.exposeInMainWorld('stickerEditor', api)
