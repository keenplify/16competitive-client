/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { createHash, sign, verify } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { webHelperAssets } from './web-helper-release.mjs'

export async function signWebHelperUpdates(
  directory,
  output,
  version,
  privateKeyPem,
  publicKeyPem
) {
  if (!/^\d{4}\.\d{3,4}\.\d+$/.test(version)) throw new Error('Invalid helper update version')
  const paths = []
  for (const fileName of webHelperAssets) {
    const bytes = await readFile(join(directory, fileName))
    if (!bytes.length || bytes.length > 256 * 1024 * 1024)
      throw new Error('Invalid helper asset size')
    const manifest = JSON.stringify({
      schemaVersion: 1,
      version,
      fileName,
      platform: fileName.endsWith('.exe') ? 'win' : 'linux',
      arch: 'x64',
      sha256: createHash('sha256').update(bytes).digest('hex'),
      sizeBytes: bytes.length
    })
    const payload = Buffer.from('16competitive.web-helper.update.v1\n' + manifest)
    const signature = sign(null, payload, privateKeyPem).toString('base64')
    if (!verify(null, payload, publicKeyPem, Buffer.from(signature, 'base64')))
      throw new Error('Web helper signing key does not match pinned key')
    const path = join(output, `${fileName}.update.json`)
    await writeFile(path, JSON.stringify({ manifest, signature }, null, 2) + '\n')
    paths.push(path)
  }
  return paths
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const directory = resolve(process.argv[2] ?? 'release-assets')
  const { publicKeyPem } = JSON.parse(await readFile('helper-release.json', 'utf8'))
  const version = (process.env.RELEASE_TAG ?? '').replace(/^v/, '')
  if (!process.env.HELPER_SIGNING_PRIVATE_KEY)
    throw new Error('Web helper update signing key is required')
  await signWebHelperUpdates(
    directory,
    directory,
    version,
    process.env.HELPER_SIGNING_PRIVATE_KEY,
    publicKeyPem
  )
}
