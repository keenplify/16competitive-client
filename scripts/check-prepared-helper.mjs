/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  verifyHelperRelease,
  verifyHelperBinary,
  verifyCosmeticModule,
  verifyNextClientModule
} from '../src/main/anticheat/helper-release-verifier.ts'

// This only preserves a signed local bundle. Runtime registry approval is still required.
export function checkPreparedHelper(root, platform, arch) {
  const config = JSON.parse(readFileSync(join(root, 'helper-release.json'), 'utf8'))
  const directory = join(root, 'resources', 'native', `${platform}-${arch}`)
  const manifest = verifyHelperRelease(
    JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8')),
    config.publicKeyPem
  )
  if (
    manifest.version !== config.version ||
    manifest.platform !== platform ||
    manifest.arch !== arch
  )
    throw new Error('Prepared helper does not match launcher pin')
  verifyHelperBinary(
    readFileSync(join(directory, platform === 'win' ? 'game-inspector.exe' : 'game-inspector')),
    manifest
  )
  if (!manifest.cosmeticModule) throw new Error('Prepared cosmetic module is missing')
  verifyCosmeticModule(readFileSync(join(directory, manifest.cosmeticModule.fileName)), manifest)
  if (platform === 'win') {
    if (!manifest.nextClientModule) throw new Error('Prepared NextClient host is missing')
    verifyNextClientModule(
      readFileSync(join(directory, manifest.nextClientModule.fileName)),
      manifest
    )
  }
}

if (process.argv[2] === '--check') {
  try {
    checkPreparedHelper(...process.argv.slice(3))
  } catch {
    process.exitCode = 1
  }
}
