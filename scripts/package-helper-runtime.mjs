/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { createHash } from 'node:crypto'
import { readFile, readdir, lstat, writeFile, mkdir, cp, mkdtemp, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
const asar = createRequire(import.meta.url)('@electron/asar')

async function stageRuntime(root, work) {
  const payload = join(work, 'payload'),
    app = join(work, 'app')
  await mkdir(payload)
  await mkdir(app)
  for (const name of await readdir(root)) {
    if (name !== 'resources') await cp(join(root, name), join(payload, name), { recursive: true })
  }
  await mkdir(join(payload, 'resources'))
  for (const name of ['native', 'scoreboard'])
    await cp(join(root, 'resources', name), join(payload, 'resources', name), { recursive: true })
  const source = join(root, 'resources', 'app.asar')
  for (const entry of asar.listPackage(source)) {
    const sourceName = entry.replace(/^[/\\]/, '')
    const name = entry.replace(/\\/g, '/').replace(/^\//, '')
    if (
      name !== 'package.json' &&
      !name.startsWith('out/main/') &&
      !name.startsWith('node_modules/')
    )
      continue
    if (
      name.split('/').some((part) => !part || part === '.' || part === '..') ||
      name.includes('\\')
    )
      throw new Error('Unsafe runtime package entry')
    const meta = asar.statFile(source, sourceName, false)
    if (meta.files) continue
    if (meta.link) throw new Error('Unsupported runtime package link')
    const target = join(app, name)
    await mkdir(join(target, '..'), { recursive: true })
    await writeFile(target, asar.extractFile(source, sourceName), {
      mode: meta.executable ? 0o755 : 0o644
    })
  }
  if (!(await lstat(join(app, 'out', 'main', 'index.js'))).isFile())
    throw new Error('Background runtime entry missing')
  await asar.createPackageWithOptions(app, join(payload, 'resources', 'app.asar'), {
    unpack: '**/*.{node,dll,so,dylib}'
  })
  return payload
}

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
  const work = await mkdtemp(join(tmpdir(), '16c-helper-package-'))
  try {
    const payload = await stageRuntime(root, work)
    await walk(payload)
    if (!files[executable]) throw new Error('Runtime executable missing')
    const fileName = `helper-runtime-${platform}-${arch}.tar.gz`
    execFileSync(
      process.platform === 'win32' ? 'tar.exe' : 'tar',
      ['-czf', resolve(output, fileName), '-C', payload, '.'],
      { stdio: 'inherit' }
    )
    const bytes = await readFile(join(output, fileName))
    if (
      bytes.length > 512 * 1024 * 1024 ||
      Object.values(files).reduce((sum, file) => sum + file.sizeBytes, 0) > 2 * 1024 * 1024 * 1024
    )
      throw new Error('Background runtime exceeds its verified download limits')
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
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await packageHelperRuntime(resolve(process.argv[2]), resolve(process.argv[3]), process.argv[4])
}
