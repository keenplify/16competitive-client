/* eslint-disable @typescript-eslint/no-require-imports */
const { statSync } = require('node:fs')
const { join } = require('node:path')

module.exports = async function verifyPackagedNative(context) {
  const platform = context.electronPlatformName
  const nativeDirectory = join(context.appOutDir, 'resources', 'native')
  const required = [platform === 'win32' ? 'game-inspector.exe' : 'game-inspector', 'manifest.json']
  if (platform === 'linux') required.push('papamo-cosmetic-module-linux-x86.so')
  if (platform === 'win32') required.push('papamo-cosmetic-module-win-x86.dll')

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
  if (platform === 'linux' || platform === 'win32') {
    const scoreboardDirectory = join(context.appOutDir, 'resources', 'scoreboard')
    for (const name of [
      'index.html',
      'renderer.js',
      'scoreboard.css',
      'preload.cjs',
      'scoreboard-feed.cjs'
    ]) {
      const file = join(scoreboardDirectory, name)
      let metadata
      try {
        metadata = statSync(file)
      } catch {
        throw new Error(`Packaged scoreboard artifact is missing: ${name}`)
      }
      if (!metadata.isFile() || metadata.size < 1) {
        throw new Error(`Packaged scoreboard artifact is invalid: ${name}`)
      }
    }
  }
}
