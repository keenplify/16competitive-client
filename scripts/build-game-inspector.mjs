/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const helperRoot = resolve(
  process.env.HELPER_SOURCE_DIR || join(root, '..', '16competitive-helper')
)
const targets = {
  'win-x64': 'x86_64-pc-windows-msvc',
  'win-ia32': 'i686-pc-windows-msvc',
  'win-arm64': 'aarch64-pc-windows-msvc',
  'linux-x64': 'x86_64-unknown-linux-gnu',
  'linux-arm64': 'aarch64-unknown-linux-gnu',
  'mac-x64': 'x86_64-apple-darwin',
  'mac-arm64': 'aarch64-apple-darwin'
}
const cosmeticTargets = {
  'win-x64': {
    target: 'i686-pc-windows-msvc',
    source: 'papamo_cosmetic_module.dll',
    destination: 'papamo-cosmetic-module-win-x86.dll'
  },
  'linux-x64': {
    target: 'i686-unknown-linux-gnu',
    source: 'libpapamo_cosmetic_module.so',
    destination: 'papamo-cosmetic-module-linux-x86.so'
  },
  'linux-arm64': {
    target: 'i686-unknown-linux-gnu',
    source: 'libpapamo_cosmetic_module.so',
    destination: 'papamo-cosmetic-module-linux-x86.so'
  }
}

function windowsBuildEnvironment() {
  if (process.platform !== 'win32') return process.env
  const configured = process.env.COSMETIC_MSVC_TOOLS_DIR
  const roots = configured
    ? [configured]
    : (() => {
        const root = join(process.env.LOCALAPPDATA || '', 'PapamoBuildTools')
        if (!existsSync(root)) return []
        return readdirSync(root, { withFileTypes: true })
          .filter((entry) => entry.isDirectory() && entry.name.startsWith('llvm-mingw-'))
          .map((entry) => join(root, entry.name, 'bin'))
      })()
  const tools = roots.find((directory) => existsSync(join(directory, 'llvm-lib.exe')))
  return tools ? { ...process.env, PATH: `${tools};${process.env.PATH || ''}` } : process.env
}

function buildRust(args, target) {
  const result = spawnSync('cargo', args, {
    stdio: 'inherit',
    shell: false,
    env: { ...windowsBuildEnvironment(), CARGO_TARGET_DIR: join(helperRoot, 'target') }
  })
  if (result.error) throw result.error
  if (result.status !== 0)
    throw new Error(
      `Rust helper build failed for ${target}. Install the Rust target and its linker; see docs/native-game-inspector.md.`
    )
}

function stageBinary(source, destination, executable) {
  if (process.platform === 'win32') {
    copyFileSync(source, destination)
    return
  }
  const temporary = `${destination}.${process.pid}.tmp`
  try {
    copyFileSync(source, temporary)
    if (executable) chmodSync(temporary, 0o755)
    renameSync(temporary, destination)
  } finally {
    rmSync(temporary, { force: true })
  }
}

export function buildGameInspector(platform, arch) {
  const target = targets[`${platform}-${arch}`]
  if (!target) throw new Error(`Unsupported native helper target: ${platform}-${arch}`)
  const manifest = join(helperRoot, 'Cargo.toml')
  buildRust(
    [
      'build',
      '--locked',
      '--release',
      '--features',
      'cosmetic-probe',
      '--manifest-path',
      manifest,
      '--target',
      target
    ],
    target
  )
  const cosmetic = cosmeticTargets[`${platform}-${arch}`]
  if (cosmetic) {
    buildRust(
      [
        'build',
        '--locked',
        '--release',
        '-p',
        'papamo-cosmetic-module',
        '--manifest-path',
        manifest,
        '--target',
        cosmetic.target
      ],
      cosmetic.target
    )
  }
  const name = platform === 'win' ? 'game-inspector.exe' : 'game-inspector'
  const destination = join(root, 'resources', 'native', `${platform}-${arch}`)
  mkdirSync(destination, { recursive: true })
  stageBinary(join(helperRoot, 'target', target, 'release', name), join(destination, name), true)
  if (cosmetic) {
    const staged = join(destination, cosmetic.destination)
    stageBinary(
      join(helperRoot, 'target', cosmetic.target, 'release', cosmetic.source),
      staged,
      true
    )
  }
  if (platform === 'win' && arch === 'x64') {
    const nextClient = join(destination, 'papamo-nextclient-client-mini-win-x86.dll')
    if (!existsSync(nextClient)) {
      const build = spawnSync(
        'pwsh',
        [
          '-NoProfile',
          '-File',
          join(helperRoot, 'scripts', 'build-nextclient-client-mini.ps1'),
          '-OutputDirectory',
          destination
        ],
        { stdio: 'inherit', shell: false }
      )
      if (build.error) throw build.error
      if (build.status !== 0) throw new Error('NextClient client_mini build failed')
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  buildGameInspector(
    process.argv[2] || { win32: 'win', darwin: 'mac', linux: 'linux' }[process.platform],
    process.argv[3] || process.arch
  )
}
