/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
const { createPackage, extractFile, getRawHeader } = createRequire(import.meta.url)(
  '@electron/asar'
)

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
export async function packageRendererUpdate(appOutDir, arch, electronVersion, output) {
  if (!['x64', 'arm64'].includes(arch)) throw new Error('Unsupported renderer-update target')
  const resources = join(appOutDir, 'resources')
  const asar = join(resources, 'app.asar')
  const header = getRawHeader(asar).header
  const files = []
  function visit(tree, prefix = '') {
    for (const [name, entry] of Object.entries(tree).sort(([a], [b]) => a.localeCompare(b, 'en'))) {
      const path = prefix ? `${prefix}/${name}` : name
      if (entry.files) visit(entry.files, path)
      else {
        if (entry.link || path.split('/').some((part) => part === '..'))
          throw new Error('Unsupported archive link/path')
        files.push([path, entry])
      }
    }
  }
  visit(header.files)
  const version = JSON.parse(extractFile(asar, 'package.json').toString('utf8')).version
  if (!/^\d{4}\.\d{3,4}\.\d+$/.test(version)) throw new Error('Invalid renderer release version')
  const temporary = await mkdtemp(join(tmpdir(), '16c-renderer-package-'))
  const fingerprints = []
  try {
    for (const [name, entry] of files) {
      const bytes = entry.unpacked
        ? await readFile(join(`${asar}.unpacked`, name))
        : extractFile(asar, name)
      if (name.startsWith('out/renderer/')) {
        if (entry.unpacked) throw new Error('Renderer updates require fully packed renderer assets')
        const target = join(temporary, name.slice('out/renderer/'.length))
        await mkdir(dirname(target), { recursive: true })
        await writeFile(target, bytes)
      } else if (name === 'package.json') {
        const pkg = JSON.parse(bytes.toString('utf8'))
        delete pkg.version
        fingerprints.push([name, sha(JSON.stringify(pkg))])
      } else fingerprints.push([name, sha(bytes)])
    }
    if (!files.some(([name]) => name === 'out/renderer/index.html'))
      throw new Error('Renderer entry is missing')
    async function external(directory, prefix = '') {
      for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
        a.name.localeCompare(b.name, 'en')
      )) {
        if (!prefix && ['app.asar', 'renderer-runtime.json'].includes(entry.name)) continue
        const name = prefix ? `${prefix}/${entry.name}` : entry.name
        const target = join(directory, entry.name)
        if (entry.isDirectory()) await external(target, name)
        else if (entry.isFile())
          fingerprints.push([`external/${name}`, sha(await readFile(target))])
        else throw new Error('Unsupported external resource')
      }
    }
    await external(resources)
    const compatibility = sha(
      JSON.stringify({ format: 1, arch, electronVersion, files: fingerprints })
    )
    await writeFile(join(resources, 'renderer-runtime.json'), JSON.stringify({ compatibility }))
    await mkdir(output, { recursive: true })
    const file = `16competitive-client-${version}-renderer-win-${arch}.asar`
    const destination = join(output, file)
    await createPackage(temporary, destination)
    const bytes = await readFile(destination)
    if (bytes.length > 128 * 1024 * 1024)
      throw new Error('Renderer archive exceeds update size limit')
    await writeFile(
      join(output, `renderer-update-win-${arch}.unsigned.json`),
      JSON.stringify(
        {
          format: 1,
          version,
          platform: 'win32',
          arch,
          compatibility,
          file,
          sha256: sha(bytes),
          size: bytes.length
        },
        null,
        2
      ) + '\n'
    )
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  await packageRendererUpdate(...process.argv.slice(2))
}
