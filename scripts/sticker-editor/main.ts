import {
  prepareStickerAtlas,
  bakeProjectedSticker,
  type StickerAtlas
} from '../../src/renderer/src/libs/web-hlmv/lib/sticker-atlas'
import { app, BrowserWindow, dialog, ipcMain, nativeImage } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawn, type ChildProcess } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { modelTextures, testSticker, type StickerPixels } from '../../src/shared/sticker-model'
import type { EditorResult } from '../../src/shared/sticker-editor'

const [uiDirectory, projectRoot, suppliedGameRoot] = process.argv.slice(2)
const gameRoot = path.resolve(
  suppliedGameRoot || path.join(os.homedir(), '.steam/steam/steamapps/common/Half-Life')
)
const helperRoot = path.resolve(projectRoot, '../16competitive-helper')
const helper =
  process.env.STICKER_HELPER ||
  path.join(
    helperRoot,
    'target/debug',
    process.platform === 'win32' ? 'game-inspector.exe' : 'game-inspector'
  )
const modulePath =
  process.env.STICKER_MODULE ||
  path.join(
    helperRoot,
    'target',
    process.platform === 'win32' ? 'i686-pc-windows-gnu' : 'i686-unknown-linux-gnu',
    'debug',
    process.platform === 'win32' ? 'papamo_cosmetic_module.dll' : 'libpapamo_cosmetic_module.so'
  )
let window: BrowserWindow
let source: Uint8Array
let atlas: StickerAtlas
let sticker: StickerPixels = testSticker()
let game: ChildProcess | undefined
let working = false
let session: string | undefined
const url = pathToFileURL(path.join(uiDirectory, 'index.html')).href

async function boundedFile(file: string, limit: number): Promise<Uint8Array> {
  const handle = await fs.open(file, 'r')
  try {
    const info = await handle.stat()
    if (!info.isFile() || info.size > limit) throw new Error('io')
    const bytes = new Uint8Array(info.size)
    let offset = 0
    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset)
      if (!bytesRead) throw new Error('io')
      offset += bytesRead
    }
    return bytes
  } finally {
    await handle.close()
  }
}

async function runHelper(args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(helper, ['--skin-probe', ...args], {
      stdio: ['ignore', 'ignore', 'pipe'],
      shell: false
    })
    let tail = ''
    child.stderr?.on('data', (chunk) => {
      tail = (tail + String(chunk)).slice(-4096)
    })
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('helper'))
    }, 180_000)
    child.once('error', () => {
      clearTimeout(timer)
      reject(new Error('helper'))
    })
    child.once('exit', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else {
        console.error(tail)
        reject(new Error('helper'))
      }
    })
  })
}

async function artifact(placement: unknown): Promise<string> {
  const bytes = bakeProjectedSticker(atlas, sticker, placement)
  const hash = createHash('sha256').update(bytes).digest('hex')
  const directory = path.join(app.getPath('userData'), 'sticker-models')
  await fs.mkdir(directory, { recursive: true, mode: 0o700 })
  const output = path.join(directory, `ak47-${hash}.mdl`)
  // Exclusive immutable output; never write into the selected Steam installation.
  try {
    await fs.writeFile(output, bytes, { flag: 'wx', mode: 0o600 })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    if (
      createHash('sha256')
        .update(await boundedFile(output, 16 * 1024 * 1024))
        .digest('hex') !== hash
    )
      throw new Error('io')
  }
  return output
}

function register<T>(name: string, action: (value: unknown) => Promise<T>): void {
  ipcMain.handle(name, async (event, value): Promise<EditorResult<T>> => {
    if (
      event.sender !== window.webContents ||
      event.senderFrame !== window.webContents.mainFrame ||
      event.senderFrame.url !== url
    )
      return { ok: false, error: 'io' }
    if (working) return { ok: false, error: 'busy' }
    working = true
    try {
      return { ok: true, value: await action(value) }
    } catch (error) {
      console.error('[sticker editor]', error)
      const message = error instanceof Error ? error.message : ''
      const allowed = [
        'cancelled',
        'image',
        'model',
        'surface',
        'placement',
        'busy',
        'helper',
        'launch'
      ] as const
      return { ok: false, error: allowed.find((code) => code === message) ?? 'io' }
    } finally {
      working = false
    }
  })
}

if (/^\d{4,5}$/.test(process.env.STICKER_EDITOR_DEBUG_PORT || '')) {
  app.commandLine.appendSwitch('remote-debugging-address', '127.0.0.1')
  app.commandLine.appendSwitch('remote-debugging-port', process.env.STICKER_EDITOR_DEBUG_PORT!)
}
app.commandLine.appendSwitch('force-renderer-accessibility')
app.setName('16competitive-sticker-editor')
app
  .whenReady()
  .then(async () => {
    window = new BrowserWindow({
      width: 1280,
      height: 820,
      minWidth: 860,
      minHeight: 640,
      backgroundColor: '#101319',
      title: '1.6 Competitive — Sticker editor',
      webPreferences: {
        preload: path.join(uiDirectory, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })
    window.setMenuBarVisibility(false)
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', (event) => event.preventDefault())
    window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) =>
      callback(false)
    )
    register('sticker:load', async () => {
      source = await boundedFile(path.join(gameRoot, 'cstrike/models/v_ak47.mdl'), 16 * 1024 * 1024)
      // This development tool supports the inspected stock AK only. The legacy
      // viewer parser is not a general untrusted-MDL importer.
      if (
        createHash('sha256').update(source).digest('hex') !==
        '6eb08a5e76210712ad787949e244fd57346b1836a7462f3a436976126e270fa3'
      )
        throw new Error('model')
      modelTextures(source)
      atlas = prepareStickerAtlas(source)
      return { atlas, sticker }
    })
    register('sticker:import', async () => {
      const result = await dialog.showOpenDialog(window, {
        properties: ['openFile'],
        filters: [{ name: 'PNG', extensions: ['png'] }]
      })
      if (result.canceled) throw new Error('cancelled')
      const bytes = Buffer.from(await boundedFile(result.filePaths[0], 2 * 1024 * 1024))
      if (
        bytes.length < 24 ||
        !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
        bytes.readUInt32BE(16) > 512 ||
        bytes.readUInt32BE(20) > 512
      )
        throw new Error('image')
      const image = nativeImage.createFromBuffer(bytes),
        { width, height } = image.getSize()
      if (image.isEmpty() || width < 1 || height < 1 || width > 512 || height > 512)
        throw new Error('image')
      const bgra = image.toBitmap(),
        rgba = new Uint8Array(bgra.length)
      for (let i = 0; i < bgra.length; i += 4)
        rgba.set([bgra[i + 2], bgra[i + 1], bgra[i], bgra[i + 3]], i)
      sticker = { width, height, rgba }
      return sticker
    })
    register('sticker:export', artifact)
    register('sticker:launch', async (placement) => {
      if (game) throw new Error('busy')
      if (!['linux', 'win32'].includes(process.platform)) throw new Error('launch')
      await fs.access(helper)
      await fs.access(modulePath)
      const output = await artifact(placement)
      if (!session) {
        const parent =
          process.platform === 'win32' ? process.env.LOCALAPPDATA : app.getPath('userData')
        if (!parent) throw new Error('helper')
        await fs.mkdir(parent, { recursive: true, mode: 0o700 })
        const candidate = path.join(parent, `sticker-probe-${randomUUID()}`)
        await runHelper(['prepare-ak47', gameRoot, modulePath, candidate])
        session = candidate
      }
      const child = spawn(helper, ['--skin-probe', 'launch-baked', session, output], {
        stdio: ['ignore', 'ignore', 'pipe'],
        shell: false
      })
      game = child
      child.stderr?.on('data', (chunk) => console.error(String(chunk).slice(-4096)))
      child.once('exit', (code) => {
        game = undefined
        if (!window.isDestroyed()) window.webContents.send('sticker:game-exit', code !== 0)
      })
      child.once('error', () => {
        game = undefined
      })
      // Catch startup errors before reporting that the private game was launched.
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          child.removeListener('exit', failed)
          child.removeListener('error', failed)
          resolve()
        }, 2500)
        function failed(): void {
          clearTimeout(timer)
          reject(new Error('launch'))
        }
        child.once('exit', failed)
        child.once('error', failed)
      })
      return session
    })
    await window.loadURL(url)
  })
  .catch((error) => {
    console.error(error)
    app.quit()
  })
// Keep the editor alive until the private game exits; don't orphan helper supervision.
app.on('window-all-closed', () => {
  if (game) game.once('exit', () => app.quit())
  else app.quit()
})
app.on('before-quit', (event) => {
  if (game) {
    event.preventDefault()
    if (!window.isDestroyed()) window.hide()
    game.once('exit', () => app.quit())
  }
})
