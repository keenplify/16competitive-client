/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type */
const { contextBridge, ipcRenderer } = require('electron')

// Capture before React mounts, so unchanged snapshots need not be retransmitted.
const cached = new Map()
const listeners = new Map()
for (const channel of ['scoreboard-snapshot', 'scoreboard-self']) {
  listeners.set(channel, new Set())
  ipcRenderer.on(channel, (_event, value) => {
    cached.set(channel, value)
    for (const listener of listeners.get(channel)) listener(value)
  })
}
function subscribe(channel, listener) {
  listeners.get(channel).add(listener)
  if (cached.has(channel)) listener(cached.get(channel))
  return () => listeners.get(channel).delete(listener)
}

contextBridge.exposeInMainWorld('scoreboardProbe', {
  onSnapshot(listener) {
    return subscribe('scoreboard-snapshot', listener)
  },
  onSelf(listener) {
    return subscribe('scoreboard-self', listener)
  },
  onKillCards(listener) {
    const handler = (_event, count, mode, aceAt, side, kinds) =>
      listener(count, mode, aceAt, side, kinds)
    ipcRenderer.on('kill-cards-count', handler)
    return () => ipcRenderer.removeListener('kill-cards-count', handler)
  }
})
