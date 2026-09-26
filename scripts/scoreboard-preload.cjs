/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type */
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('scoreboardProbe', {
  onSnapshot(listener) {
    const handler = (_event, snapshot) => listener(snapshot)
    ipcRenderer.on('scoreboard-snapshot', handler)
    return () => ipcRenderer.removeListener('scoreboard-snapshot', handler)
  }
})
