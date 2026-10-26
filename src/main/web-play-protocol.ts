import { app } from 'electron'
import { execFile } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { setDefaultMimeHandler } from './linux-mimeapps'
import { desktopArgument } from './demo-protocol'
import { WEB_HELPER_PROTOCOL } from '../shared/web-helper-link'

const run = promisify(execFile)

export async function registerWebPlayProtocol(): Promise<void> {
  if (process.platform !== 'linux') {
    const ok =
      process.defaultApp && process.argv[1]
        ? app.setAsDefaultProtocolClient(WEB_HELPER_PROTOCOL, process.execPath, [
            resolve(process.argv[1])
          ])
        : app.setAsDefaultProtocolClient(WEB_HELPER_PROTOCOL)
    if (!ok) throw new Error('Could not register the web play handler')
    return
  }
  const appImage = process.env.APPIMAGE
  const executable = appImage && isAbsolute(appImage) ? appImage : process.execPath
  if (executable.startsWith('/tmp/.mount_')) throw new Error('AppImage path unavailable')
  const args = app.isPackaged ? [executable] : [executable, app.getAppPath()]
  const dataHome = process.env.XDG_DATA_HOME
  const directory = join(
    dataHome && isAbsolute(dataHome) ? dataHome : join(homedir(), '.local', 'share'),
    'applications'
  )
  const desktopId = 'competitive16-web-play.desktop'
  await mkdir(directory, { recursive: true })
  await writeFile(
    join(directory, desktopId),
    [
      '[Desktop Entry]',
      'Type=Application',
      'Name=1.6 Competitive Web Play',
      `Exec=${args.map(desktopArgument).join(' ')} %u`,
      'Terminal=false',
      'NoDisplay=true',
      `MimeType=x-scheme-handler/${WEB_HELPER_PROTOCOL};`,
      ''
    ].join('\n'),
    { mode: 0o600 }
  )
  const configHome = process.env.XDG_CONFIG_HOME
  const configDirectory =
    configHome && isAbsolute(configHome) ? configHome : join(homedir(), '.config')
  await mkdir(configDirectory, { recursive: true })
  const mimeappsPath = join(configDirectory, 'mimeapps.list')
  const previous = await readFile(mimeappsPath, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return ''
    throw error
  })
  await writeFile(
    mimeappsPath,
    setDefaultMimeHandler(previous, `x-scheme-handler/${WEB_HELPER_PROTOCOL}`, desktopId),
    { mode: 0o600 }
  )
  await run('update-desktop-database', [directory], { timeout: 5000 }).catch(() => undefined)
}
