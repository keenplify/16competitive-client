/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type */
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('scoreboardProbe', {
  onSnapshot(listener) {
    const handler = (_event, snapshot) => listener(snapshot)
    ipcRenderer.on('scoreboard-snapshot', handler)
    return () => ipcRenderer.removeListener('scoreboard-snapshot', handler)
  },
  onSelf(listener) {
    const handler = (_event, username) => listener(username)
    ipcRenderer.on('scoreboard-self', handler)
    return () => ipcRenderer.removeListener('scoreboard-self', handler)
  },
  onKillCards(listener) {
    const handler = (_event, count, mode, aceAt, side) => listener(count, mode, aceAt, side)
    ipcRenderer.on('kill-cards-count', handler)
    return () => ipcRenderer.removeListener('kill-cards-count', handler)
  }
})
