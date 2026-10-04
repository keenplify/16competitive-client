import { randomBytes } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import * as dbus from 'dbus-native'
import { nativeImage } from 'electron'

const PORTAL = 'org.freedesktop.portal.Desktop'
const PORTAL_PATH = '/org/freedesktop/portal/desktop'
const REQUEST_INTERFACE = 'org.freedesktop.portal.Request'
const MAX_SOURCE_BYTES = 16 * 1024 * 1024
const MAX_PNG_BYTES = 2 * 1024 * 1024
const PNG_HEADER = Buffer.from('89504e470d0a1a0a', 'hex')

/** Ask the Wayland compositor for one screenshot; this never opens a screen stream. */
export async function captureWaylandScreenshot(signal?: AbortSignal): Promise<Buffer | null> {
  const bus = dbus.sessionBus()
  let subscription: dbus.Subscription | null = null
  let requestPath: string | null = null
  let closeRequest = false
  let responseKey: string | null = null
  let responseListener: ((body: unknown) => void) | null = null
  try {
    // Establish our unique D-Bus name before constructing the portal request path.
    await bus.invoke(
      {
        destination: PORTAL,
        path: PORTAL_PATH,
        interface: 'org.freedesktop.DBus.Properties',
        member: 'Get',
        signature: 'ss',
        body: ['org.freedesktop.portal.Screenshot', 'version']
      },
      { timeout: 5000, signal }
    )
    if (!bus.name || signal?.aborted) return null
    const token = `shot${randomBytes(8).toString('hex')}`
    const sender = bus.name.slice(1).replaceAll('.', '_')
    const expectedPath = `${PORTAL_PATH}/request/${sender}/${token}`
    responseKey = bus.mangle(expectedPath, REQUEST_INTERFACE, 'Response')
    let resolveResponse: (body: unknown) => void = () => undefined
    const response = new Promise<unknown>((resolve) => {
      resolveResponse = resolve
    })
    responseListener = resolveResponse
    bus.signals.on(responseKey, responseListener)
    subscription = await bus.watch(
      `type='signal',interface='${REQUEST_INTERFACE}',member='Response',path='${expectedPath}'`
    )
    requestPath = await bus.invoke<string>(
      {
        destination: PORTAL,
        path: PORTAL_PATH,
        interface: 'org.freedesktop.portal.Screenshot',
        member: 'Screenshot',
        signature: 'sa{sv}',
        body: [
          '',
          {
            handle_token: new dbus.Variant('s', token),
            interactive: new dbus.Variant('b', false)
          }
        ]
      },
      { timeout: 5000, signal }
    )
    if (requestPath !== expectedPath) return null
    if (signal?.aborted) {
      closeRequest = true
      return null
    }

    let timeout: NodeJS.Timeout | undefined
    let onAbort: (() => void) | undefined
    const cancelled = new Promise<null>((resolve) => {
      timeout = setTimeout(() => resolve(null), 30_000)
      onAbort = () => resolve(null)
      signal?.addEventListener('abort', onAbort, { once: true })
    })
    const body = await Promise.race([response, cancelled])
    clearTimeout(timeout)
    if (onAbort) signal?.removeEventListener('abort', onAbort)
    if (body === null) closeRequest = true
    if (!Array.isArray(body) || body[0] !== 0) return null
    const results = dbus.toPlain<Record<string, unknown>>(body[1])
    const uri = results?.uri
    if (typeof uri !== 'string' || !uri.startsWith('file://')) return null
    const path = fileURLToPath(uri)
    const file = await stat(path)
    if (!file.isFile() || file.size < 24 || file.size > MAX_SOURCE_BYTES) return null
    const source = await readFile(path)
    if (!source.subarray(0, 8).equals(PNG_HEADER) || source.toString('ascii', 12, 16) !== 'IHDR')
      return null
    const width = source.readUInt32BE(16)
    const height = source.readUInt32BE(20)
    if (width < 320 || height < 200 || width > 8192 || height > 4320) return null
    const image = nativeImage.createFromBuffer(source)
    if (image.isEmpty()) return null
    const scale = Math.min(1, 1280 / width, 720 / height)
    const resized =
      scale < 1
        ? image.resize({ width: Math.round(width * scale), height: Math.round(height * scale) })
        : image
    const png = resized.toPNG()
    return png.length > 0 && png.length <= MAX_PNG_BYTES ? png : null
  } catch {
    return null
  } finally {
    if (requestPath && (signal?.aborted || closeRequest)) {
      await bus
        .invoke(
          { destination: PORTAL, path: requestPath, interface: REQUEST_INTERFACE, member: 'Close' },
          { timeout: 2000 }
        )
        .catch(() => undefined)
    }
    if (responseKey && responseListener) bus.signals.off(responseKey, responseListener)
    await subscription?.remove().catch(() => undefined)
    await bus.close().catch(() => undefined)
  }
}
