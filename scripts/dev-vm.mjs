/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { lstat, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const capture = promisify(execFile)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const vm = '16competitive-build-win11'
const state = join(homedir(), '.local/share/16competitive-build/windows')
const options = [
  '-o',
  'BatchMode=yes',
  '-o',
  'ConnectTimeout=5',
  '-i',
  join(state, 'ssh-key'),
  '-o',
  `UserKnownHostsFile=${join(state, 'known_hosts')}`,
  '-o',
  'StrictHostKeyChecking=yes'
]
const ssh = ['-p', '2222', ...options, 'build@127.0.0.1']
const scp = ['-P', '2222', ...options]
export function safeSourcePath(path) {
  const parts = path.replaceAll('\\', '/').split('/')
  return (
    path.length > 0 &&
    !path.startsWith('/') &&
    !/[:\\\r\n\0]/.test(path) &&
    !/\.(?:key|p12|pfx)$/i.test(path) &&
    !parts.some(
      (p) =>
        p === '..' ||
        p === '.' ||
        p === '.git' ||
        p.toLowerCase() === 'config.cfg' ||
        p.startsWith('.env') ||
        /(?:^|[-_.])(secret|credential|private-key)(?:$|[-_.])/i.test(p)
    )
  )
}
export function powershellCommand(code) {
  return [
    'powershell.exe',
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-EncodedCommand',
    Buffer.from(
      "$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';" + code,
      'utf16le'
    ).toString('base64')
  ]
}
async function run(command, args) {
  await new Promise((done, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', shell: false })
    child.on('error', reject)
    child.on('exit', (code) =>
      code === 0 ? done() : reject(new Error(`${command} exited with ${code}`))
    )
  })
}
async function snapshot(source, archive, directory) {
  const sourceRoot = await realpath(source)
  const { stdout } = await capture(
    'git',
    ['-C', source, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { maxBuffer: 8 * 1024 * 1024 }
  )
  const files = []
  for (const path of new Set(stdout.split('\0').filter(safeSourcePath))) {
    // Never follow source symlinks into machine data or game installations.
    const candidate = join(source, path)
    if (
      (await lstat(candidate).catch(() => null))?.isFile() &&
      (await realpath(candidate)).startsWith(sourceRoot + sep)
    )
      files.push(path)
  }
  const list = join(directory, `${basename(archive)}.list`)
  await writeFile(list, files.join('\0') + '\0', { mode: 0o600 })
  await run('tar', ['-C', source, '--null', '--verbatim-files-from', '-T', list, '-cf', archive])
  await writeFile(`${archive}.json`, JSON.stringify(files), { mode: 0o600 })
}
export async function main() {
  if (process.platform !== 'linux')
    throw new Error('dev:vm runs on the configured Linux libvirt host.')
  const args = process.argv.slice(2)
  if (args.some((a) => !['--prepare-only', '--no-viewer'].includes(a)))
    throw new Error('Options: --prepare-only, --no-viewer')
  for (const name of ['ssh-key', 'known_hosts']) {
    if (!(await lstat(join(state, name))).isFile()) throw new Error(`Missing VM SSH ${name}`)
  }
  const { stdout } = await capture('virsh', ['-c', 'qemu:///session', 'domstate', vm])
  if (stdout.trim() === 'shut off') await run('virsh', ['-c', 'qemu:///session', 'start', vm])
  else if (stdout.trim() !== 'running')
    throw new Error(`VM is ${stdout.trim()}; resume it in virt-manager first.`)
  if (!args.includes('--no-viewer')) {
    const viewer = spawn('virt-viewer', ['--connect', 'qemu:///session', vm], {
      detached: true,
      stdio: 'ignore'
    })
    viewer.on('error', (e) => console.warn(`Could not open virt-viewer: ${e.message}`))
    viewer.unref()
  }
  console.log('Waiting for Windows SSH...')
  const deadline = Date.now() + 180_000
  while (true) {
    try {
      await capture('ssh', [
        ...ssh,
        ...powershellCommand(
          "if (!(Test-Path C:\\16c-build\\ready)) { throw 'Windows tools are not ready' }"
        )
      ])
      break
    } catch (error) {
      if (Date.now() >= deadline) throw error
      await new Promise((done) => setTimeout(done, 3000))
    }
  }
  const directory = await mkdtemp(join(tmpdir(), '16c-dev-vm-'))
  try {
    console.log('Preparing the approved signed Windows native release...')
    await run(process.execPath, [
      '--experimental-strip-types',
      'scripts/prepare-game-inspector.mjs',
      'win',
      'x64'
    ])
    const client = join(directory, 'client.tar'),
      helper = join(directory, 'helper.tar')
    console.log('Syncing current client and private helper source (including uncommitted edits)...')
    await snapshot(root, client, directory)
    await snapshot(resolve(root, '../16competitive-helper'), helper, directory)
    await run('ssh', [
      ...ssh,
      ...powershellCommand('New-Item -ItemType Directory -Force C:\\16c-dev | Out-Null')
    ])
    await run('scp', [
      ...scp,
      client,
      `${client}.json`,
      helper,
      `${helper}.json`,
      join(root, 'scripts/dev-vm/windows.ps1'),
      'build@127.0.0.1:C:/16c-dev/'
    ])
    await run('ssh', [
      ...ssh,
      ...powershellCommand(
        'New-Item -ItemType Directory -Force C:\\16c-dev\\native-assets | Out-Null'
      )
    ])
    await run('scp', [
      ...scp,
      ...[
        'game-inspector.exe',
        'manifest.json',
        'papamo-cosmetic-module-win-x86.dll',
        'papamo-nextclient-client-mini-win-x86.dll'
      ].map((name) => join(root, 'resources/native/win-x64', name)),
      'build@127.0.0.1:C:/16c-dev/native-assets/'
    ])
    await run('ssh', [
      ...ssh,
      ...powershellCommand('& C:\\16c-dev\\windows.ps1 -Prepare; if (!$?) { exit 1 }')
    ])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
  if (args.includes('--prepare-only')) return
  // SSH keeps HTTP/WS/asset traffic on guest loopback, preserving the helper's
  // existing development-only loopback policy. No new backend trust exceptions.
  const tunnel = spawn(
    'ssh',
    [
      ...ssh.slice(0, -1),
      '-o',
      'ExitOnForwardFailure=yes',
      '-R',
      '127.0.0.1:3000:127.0.0.1:3000',
      '-N',
      ssh.at(-1)
    ],
    { stdio: 'inherit' }
  )
  let tunnelError,
    cancelled = false
  tunnel.on('error', (error) => {
    tunnelError = error
  })
  tunnel.on('exit', (code) => {
    tunnelError = new Error(`Backend tunnel exited (${code}).`)
  })
  const stop = () => {
    cancelled = true
    tunnel.kill('SIGTERM')
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  try {
    console.log('Log into the Windows desktop as build. Waiting for an interactive session...')
    while (true) {
      if (cancelled) return
      if (tunnelError) throw tunnelError
      const result = await capture(
        'ssh',
        [...ssh, ...powershellCommand('(Get-CimInstance Win32_ComputerSystem).UserName')],
        { timeout: 20_000 }
      )
      if (result.stdout.trim().toLowerCase().endsWith('\\build')) break
      await new Promise((done) => setTimeout(done, 3000))
    }
    await run('ssh', [
      ...ssh,
      ...powershellCommand('& C:\\16c-dev\\windows.ps1 -Launch; if (!$?) { exit 1 }')
    ])
    console.log(
      'Windows dev console started. Keep this terminal open for backend forwarding. Rerun after closing the guest dev console to sync host edits.'
    )
    await new Promise((done, reject) => {
      tunnel.once('exit', (code) => (code === 0 || code === null ? done() : reject(tunnelError)))
      tunnel.once('error', reject)
    })
  } finally {
    stop()
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`dev:vm: ${error.message}`)
    process.exitCode = 1
  })
}
