/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { readFile, writeFile, mkdir, copyFile, chmod } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

export async function stageSessionHelper(root, platform, arch) {
  if (!['win', 'linux'].includes(platform) || !['x64', 'arm64'].includes(arch))
    throw new Error('Standalone session helper is unavailable for this target')
  const binary = `competitive16-web-helper${platform === 'win' ? '.exe' : ''}`
  const asset = platform === 'win' ? binary : `${binary}-linux${arch === 'arm64' ? '-arm64' : ''}`
  const candidates = [
    join(root, 'resources/session-binaries', asset),
    join(
      root,
      'web-helper/target',
      arch === 'arm64' ? 'aarch64-unknown-linux-gnu/release' : 'release',
      binary
    )
  ]
  let source, bytes
  for (const candidate of candidates) {
    try {
      bytes = await readFile(candidate)
      source = candidate
      break
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }
  if (!source || !bytes?.length)
    throw new Error(`Build or stage ${asset} before packaging the launcher`)
  if (
    platform === 'win'
      ? bytes.subarray(0, 2).toString() !== 'MZ'
      : bytes.subarray(0, 4).toString() !== '\x7fELF'
  )
    throw new Error('Standalone session helper has the wrong platform')
  if (
    platform === 'linux' &&
    (bytes.length < 64 ||
      bytes[4] !== 2 ||
      bytes.readUInt16LE(18) !== (arch === 'arm64' ? 183 : 62))
  )
    throw new Error('Standalone session helper has the wrong architecture')
  if (platform === 'win') {
    const offset = bytes.length >= 64 ? bytes.readUInt32LE(60) : bytes.length
    if (
      offset + 6 > bytes.length ||
      bytes.subarray(offset, offset + 4).toString() !== 'PE\0\0' ||
      bytes.readUInt16LE(offset + 4) !== (arch === 'arm64' ? 0xaa64 : 0x8664)
    )
      throw new Error('Standalone session helper has the wrong architecture')
  }
  const directory = join(root, 'resources/session-helper', `${platform}-${arch}`)
  await mkdir(directory, { recursive: true })
  await copyFile(source, join(directory, binary))
  await chmod(join(directory, binary), 0o755)
  await writeFile(
    join(directory, 'manifest.json'),
    JSON.stringify({ sha256: createHash('sha256').update(bytes).digest('hex') })
  )
}
