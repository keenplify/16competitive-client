/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, mkdirSync } from 'node:fs'
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

export function buildGameInspector(platform, arch) {
  const target = targets[`${platform}-${arch}`]
  if (!target) throw new Error(`Unsupported native helper target: ${platform}-${arch}`)
  const manifest = join(helperRoot, 'Cargo.toml')
  const result = spawnSync(
    'cargo',
    ['build', '--locked', '--release', '--manifest-path', manifest, '--target', target],
    {
      stdio: 'inherit',
      shell: false,
      env: { ...process.env, CARGO_TARGET_DIR: join(helperRoot, 'target') }
    }
  )
  if (result.error) throw result.error
  if (result.status !== 0)
    throw new Error(
      `Rust helper build failed for ${target}. Install the Rust target and its linker; see docs/native-game-inspector.md.`
    )
  const name = platform === 'win' ? 'game-inspector.exe' : 'game-inspector'
  const destination = join(root, 'resources', 'native', `${platform}-${arch}`)
  mkdirSync(destination, { recursive: true })
  copyFileSync(join(helperRoot, 'target', target, 'release', name), join(destination, name))
  if (platform !== 'win') chmodSync(join(destination, name), 0o755)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  buildGameInspector(
    process.argv[2] || { win32: 'win', darwin: 'mac', linux: 'linux' }[process.platform],
    process.argv[3] || process.arch
  )
}
