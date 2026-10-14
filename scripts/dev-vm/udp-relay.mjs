/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* Local Windows VM development only. No production routing or trust changes. */
import { createSocket } from 'node:dgram'
const sockets = new Set()
for (let port = 27015; port <= 27019; port++) {
  const listener = createSocket('udp4')
  const peers = new Map()
  sockets.add(listener)
  listener.on('error', (error) => {
    console.error(`VM UDP ${port}: ${error.message}`)
    process.exitCode = 1
    close()
  })
  listener.on('message', (data, sender) => {
    if (sender.address !== '127.0.0.1') return
    let peer = peers.get(sender.port)
    if (!peer) {
      if (peers.size >= 16) return
      const socket = createSocket('udp4')
      sockets.add(socket)
      peer = { socket, lastSeen: Date.now() }
      peers.set(sender.port, peer)
      socket.on('error', (error) => console.error(`VM UDP destination: ${error.message}`))
      socket.on('message', (reply, remote) => {
        if (remote.address === '10.0.2.2' && remote.port === port)
          listener.send(reply, sender.port, '127.0.0.1')
      })
    }
    peer.lastSeen = Date.now()
    peer.socket.send(data, port, '10.0.2.2', (error) => {
      if (error) console.error(`VM UDP send: ${error.message}`)
    })
  })
  listener.bind(port, '127.0.0.1')
  const sweep = setInterval(() => {
    for (const [id, peer] of peers)
      if (Date.now() - peer.lastSeen > 60_000) {
        peer.socket.close()
        sockets.delete(peer.socket)
        peers.delete(id)
      }
  }, 10_000)
  listener.once('close', () => clearInterval(sweep))
}
function close() {
  for (const socket of sockets) {
    try {
      socket.close()
    } catch {
      /* already closed */
    }
  }
  sockets.clear()
}
process.once('SIGINT', close)
process.once('SIGTERM', close)
