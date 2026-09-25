/* eslint-disable @typescript-eslint/no-require-imports */
const { statSync } = require('node:fs')
const { join } = require('node:path')

module.exports = async function verifyPackagedNative(context) {
  const platform = context.electronPlatformName
  const nativeDirectory = join(context.appOutDir, 'resources', 'native')
  const required = [platform === 'win32' ? 'game-inspector.exe' : 'game-inspector', 'manifest.json']
  if (platform === 'linux') required.push('papamo-cosmetic-module-linux-x86.so')

  for (const name of required) {
    const file = join(nativeDirectory, name)
    let metadata
    try {
      metadata = statSync(file)
    } catch {
      throw new Error(`Packaged native artifact is missing: ${name}`)
    }
    if (!metadata.isFile() || metadata.size < 1) {
      throw new Error(`Packaged native artifact is invalid: ${name}`)
    }
  }
}
