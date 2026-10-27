/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { createHash } from 'node:crypto'
import { readFile, readdir, lstat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export async function packageHelperRuntime(root, output, platform, arch = 'x64') {
  if (!['win', 'linux'].includes(platform) || arch !== 'x64')
    throw new Error('Unsupported runtime target')
  const executable = platform === 'win' ? '16competitive-client.exe' : '16competitive-client'
  const { version } = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8')
  )
  const files = {}
  async function walk(directory, prefix = '') {
    for (const name of (await readdir(directory)).sort()) {
      const path = prefix + name
      const meta = await lstat(join(directory, name))
      if (meta.isSymbolicLink()) throw new Error(`Runtime cannot contain links: ${path}`)
      if (meta.isDirectory()) await walk(join(directory, name), path + '/')
      else if (meta.isFile())
        files[path] = {
          sha256: createHash('sha256')
            .update(await readFile(join(directory, name)))
            .digest('hex'),
          sizeBytes: meta.size,
          executable: Boolean(meta.mode & 0o111)
        }
      else throw new Error(`Unsupported runtime entry: ${path}`)
    }
  }
  await walk(root)
  if (!files[executable]) throw new Error('Runtime executable missing')
  const fileName = `helper-runtime-${platform}-${arch}.tar.gz`
  execFileSync(
    process.platform === 'win32' ? 'tar.exe' : 'tar',
    ['-czf', resolve(output, fileName), '-C', root, '.'],
    { stdio: 'inherit' }
  )
  const bytes = await readFile(join(output, fileName))
  const manifest = {
    schemaVersion: 1,
    version,
    platform,
    arch,
    fileName,
    executable,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    sizeBytes: bytes.length,
    files
  }
  await writeFile(join(output, `${fileName}.unsigned.json`), JSON.stringify(manifest) + '\n')
  return manifest
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await packageHelperRuntime(resolve(process.argv[2]), resolve(process.argv[3]), process.argv[4])
}
