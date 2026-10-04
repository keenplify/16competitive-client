import { app } from 'electron'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { DEMO_PROTOCOL } from '../shared/demo-link'
import { setDefaultMimeHandler } from './linux-mimeapps'
const run = promisify(execFile)

// Desktop Exec is not a shell command. Quote its reserved characters and escape
// percent signs so paths cannot become desktop field codes.
export function desktopArgument(value: string): string {
  if (!value || /[\r\n\0]/.test(value)) throw new Error('Invalid desktop launch argument')
  return `"${value
    .replace(/\\/g, '\\\\\\\\')
    .replace(/(["`$])/g, '\\\\$1')
    .replace(/%/g, '%%')}"`
}
export async function registerDemoProtocol(): Promise<void> {
  if (process.platform !== 'linux') {
    const ok =
      process.defaultApp && process.argv[1]
        ? app.setAsDefaultProtocolClient(DEMO_PROTOCOL, process.execPath, [
            resolve(process.argv[1])
          ])
        : app.setAsDefaultProtocolClient(DEMO_PROTOCOL)
    if (!ok) throw new Error('Could not register the demo link handler')
    return
  }
  const appImage = process.env.APPIMAGE
  const executable = appImage && isAbsolute(appImage) ? appImage : process.execPath
  // Never register Electron's temporary AppImage mount as a persistent launcher.
  if (executable.startsWith('/tmp/.mount_'))
    throw new Error('AppImage path unavailable for demo registration')
  const args = app.isPackaged ? [executable] : [executable, app.getAppPath()]
  const dataHome = process.env.XDG_DATA_HOME
  const directory = join(
    dataHome && isAbsolute(dataHome) ? dataHome : join(homedir(), '.local', 'share'),
    'applications'
  )
  const desktopId = '16competitive-demo-handler.desktop'
  await mkdir(directory, { recursive: true })
  await writeFile(
    join(directory, desktopId),
    [
      '[Desktop Entry]',
      'Type=Application',
      'Name=1.6 Competitive Demo Playback',
      `Exec=${args.map(desktopArgument).join(' ')} %u`,
      'Terminal=false',
      'NoDisplay=true',
      `MimeType=x-scheme-handler/${DEMO_PROTOCOL};`,
      ''
    ].join('\n'),
    { mode: 0o600 }
  )
  // Some KDE xdg-mime versions depend on unavailable Qt tools. Write the
  // standard user association directly instead of invoking a desktop opener.
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
    setDefaultMimeHandler(previous, `x-scheme-handler/${DEMO_PROTOCOL}`, desktopId),
    { mode: 0o600 }
  )
  // Refreshing the MIME cache is optional; minimal installations may omit it.
  await run('update-desktop-database', [directory], { timeout: 5000 }).catch((error: unknown) => {
    console.warn('[DemoPlayback] Could not refresh desktop MIME cache:', error)
  })
}
