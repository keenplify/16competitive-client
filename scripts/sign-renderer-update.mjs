/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { sign } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  parseRendererManifest,
  rendererUpdateContext,
  verifyRendererBytes,
  verifyRendererEnvelope
} from '../src/shared/renderer-update.ts'

export async function signRendererUpdate(directory, output, version, privateKeyPem, publicKeyPem) {
  const manifest = await readFile(join(directory, 'renderer-update-win-x64.unsigned.json'), 'utf8')
  const parsed = parseRendererManifest(JSON.parse(manifest))
  if (parsed.version !== version || parsed.arch !== 'x64')
    throw new Error('Renderer signing release mismatch')
  verifyRendererBytes(await readFile(join(directory, parsed.file)), parsed)
  const envelope = {
    manifest,
    signature: sign(null, Buffer.from(rendererUpdateContext + manifest), privateKeyPem).toString(
      'base64'
    )
  }
  verifyRendererEnvelope(envelope, publicKeyPem)
  const path = join(output, 'renderer-update-win-x64.json')
  await writeFile(path, JSON.stringify(envelope, null, 2) + '\n')
  return path
}
