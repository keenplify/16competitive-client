import { BrowserWindow, session } from 'electron'
import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'

/** Capture belongs to a sandboxed, local helper document. No remote document
 * receives microphone permission and no audio is written to disk. */
export async function runHelperMicrophone(
  origin: string,
  ready: (value: unknown) => void
): Promise<void> {
  const capability = randomBytes(32).toString('hex')
  const captureSession = session.fromPartition(`helper-microphone-${capability}`)
  let window: BrowserWindow | null = null
  let offered = false
  let closing = false
  let lastLease = Date.now()
  let localOrigin = ''
  captureSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(
      contents === window?.webContents &&
        permission === 'media' &&
        details.requestingUrl === `${localOrigin}/${capability}` &&
        'mediaTypes' in details &&
        details.mediaTypes?.length === 1 &&
        details.mediaTypes[0] === 'audio'
    )
  })
  captureSession.setPermissionCheckHandler(
    (contents, permission, requestingOrigin, details) =>
      contents === window?.webContents &&
      permission === 'media' &&
      requestingOrigin === localOrigin &&
      details.mediaType === 'audio'
  )
  const server = createServer(async (request, response) => {
    const reject = (status: number): void => {
      response.writeHead(status)
      response.end()
    }
    if (request.headers.host !== new URL(localOrigin).host) return reject(403)
    if (request.method === 'GET' && request.url === `/${capability}`) {
      response.writeHead(200, {
        'content-type': 'text/html',
        'content-security-policy':
          "default-src 'none'; script-src 'unsafe-eval'; connect-src 'none'",
        'cache-control': 'no-store'
      })
      response.end('<!doctype html><title>1.6 Competitive microphone</title>')
      return
    }
    if (request.headers.origin !== origin) return reject(403)
    response.setHeader('Access-Control-Allow-Origin', origin)
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    response.setHeader('Access-Control-Allow-Headers', 'authorization, content-type')
    response.setHeader('Access-Control-Allow-Private-Network', 'true')
    response.setHeader('Vary', 'Origin')
    response.setHeader('Cache-Control', 'no-store')
    if (request.method === 'OPTIONS' && ['/offer', '/close'].includes(request.url ?? ''))
      return reject(204)
    if (
      request.method === 'POST' &&
      request.url === '/close' &&
      request.headers.authorization === `Bearer ${capability}`
    ) {
      closing = true
      return reject(204)
    }
    if (
      request.method !== 'POST' ||
      request.url !== '/offer' ||
      request.headers.authorization !== `Bearer ${capability}` ||
      request.headers['content-type'] !== 'application/json' ||
      offered ||
      !window
    )
      return reject(403)
    offered = true
    try {
      let body = ''
      for await (const chunk of request) {
        body += chunk.toString()
        if (Buffer.byteLength(body) > 16384) throw new Error('Offer exceeds limit')
      }
      const offer: unknown = JSON.parse(body)
      if (
        !offer ||
        typeof offer !== 'object' ||
        (offer as { type?: unknown }).type !== 'offer' ||
        typeof (offer as { sdp?: unknown }).sdp !== 'string'
      )
        throw new Error('Invalid offer')
      const answer: unknown = await window.webContents.executeJavaScript(`(async () => {
        const peer = new RTCPeerConnection({ iceServers: [] });
        window.capturePeer = peer;
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false
        });
        window.captureStream = stream;
        for (const track of stream.getTracks()) peer.addTrack(track, stream);
        await peer.setRemoteDescription(${JSON.stringify(offer)});
        await peer.setLocalDescription(await peer.createAnswer());
        if (peer.iceGatheringState !== 'complete') await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('ICE timeout')), 10000);
          peer.onicegatheringstatechange = () => {
            if (peer.iceGatheringState === 'complete') { clearTimeout(timeout); resolve(); }
          };
        });
        return peer.localDescription.toJSON();
      })()`)
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify(answer))
      lastLease = Date.now()
    } catch {
      reject(503)
      lastLease = 0
    }
  })
  server.requestTimeout = 15_000
  server.headersTimeout = 10_000
  server.maxConnections = 4
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Microphone server unavailable')
  localOrigin = `http://127.0.0.1:${address.port}`
  try {
    window = new BrowserWindow({
      show: false,
      webPreferences: {
        session: captureSession,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        backgroundThrottling: false
      }
    })
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', (event) => event.preventDefault())
    await window.loadURL(`${localOrigin}/${capability}`)
    ready({ ok: true, event: 'microphoneReady', port: address.port, capability })
    const expires = Date.now() + 2 * 60 * 60_000
    while (!window.isDestroyed() && Date.now() < expires && Date.now() - lastLease < 30_000) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      if (closing) break
      const state: unknown = await window.webContents.executeJavaScript(
        'window.capturePeer?.connectionState'
      )
      if (state === 'connected') lastLease = Date.now()
      if (
        state === 'failed' ||
        state === 'closed' ||
        (state === 'disconnected' && Date.now() - lastLease > 3000)
      )
        break
      ready({ event: 'microphoneHeartbeat' })
    }
  } finally {
    window?.destroy()
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}
