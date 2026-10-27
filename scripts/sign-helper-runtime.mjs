/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { createHash, sign, verify } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const helperRuntimeAssets = [
  'helper-runtime-win-x64.tar.gz',
  'helper-runtime-linux-x64.tar.gz'
]
export async function signHelperRuntimes(directory, output, version, privateKeyPem, publicKeyPem) {
  const paths = []
  for (const name of helperRuntimeAssets) {
    const manifest = (await readFile(join(directory, `${name}.unsigned.json`), 'utf8')).trim()
    const m = JSON.parse(manifest),
      bytes = await readFile(join(directory, name))
    if (
      m.schemaVersion !== 1 ||
      m.version !== version ||
      m.fileName !== name ||
      m.sizeBytes !== bytes.length ||
      bytes.length > 512 * 1024 * 1024 ||
      m.sha256 !== createHash('sha256').update(bytes).digest('hex')
    )
      throw new Error('Runtime manifest does not match this release')
    const payload = Buffer.from('16competitive.helper-runtime.v1\n' + manifest)
    const signature = sign(null, payload, privateKeyPem).toString('base64')
    if (!verify(null, payload, publicKeyPem, Buffer.from(signature, 'base64')))
      throw new Error('Runtime signing key does not match pinned key')
    const path = join(output, `${name}.update.json`)
    await writeFile(path, JSON.stringify({ manifest, signature }) + '\n')
    paths.push(path)
  }
  return paths
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const directory = resolve(process.argv[2] ?? 'release-assets')
  const { publicKeyPem } = JSON.parse(await readFile('helper-release.json', 'utf8'))
  if (!process.env.HELPER_SIGNING_PRIVATE_KEY) throw new Error('Runtime signing key is required')
  await signHelperRuntimes(
    directory,
    directory,
    (process.env.RELEASE_TAG ?? '').replace(/^v/, ''),
    process.env.HELPER_SIGNING_PRIVATE_KEY,
    publicKeyPem
  )
}
