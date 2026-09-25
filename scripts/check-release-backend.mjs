import { readFile } from 'node:fs/promises'
import { isLoopbackBackend } from '../src/main/backend-policy.ts'

// Inspect the actual build-time settings, not unrelated development fallback strings in the bundle.
const target = JSON.parse(await readFile('out/main/backend-target.json', 'utf8'))
for (const [key, protocol] of [
  ['apiUrl', 'https:'],
  ['websocketUrl', 'wss:']
]) {
  const url = new URL(target[key])
  if (url.protocol !== protocol || isLoopbackBackend(url.href) || url.username || url.password)
    throw new Error(`Release ${key} must point to an HTTPS/WSS remote backend`)
}
