/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type */
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('allyTags', {
  onTags(listener) {
    const handler = (_event, value) => listener(typeof value === 'string' ? value : '')
    ipcRenderer.on('ally-tags', handler)
    return () => ipcRenderer.removeListener('ally-tags', handler)
  }
})
