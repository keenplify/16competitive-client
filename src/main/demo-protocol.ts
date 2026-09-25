import { app } from 'electron'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { DEMO_PROTOCOL } from '../shared/demo-link'
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
  await run('xdg-mime', ['default', desktopId, `x-scheme-handler/${DEMO_PROTOCOL}`], {
    timeout: 10000
  })
  const result = await run('xdg-mime', ['query', 'default', `x-scheme-handler/${DEMO_PROTOCOL}`], {
    timeout: 10000
  })
  if (result.stdout.trim() !== desktopId)
    throw new Error('Desktop did not select the demo link handler')
}
