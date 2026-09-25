// Packaging accepts only a signed, backend-approved helper release.
module.exports = async function beforePack(context) {
  const { execFileSync } = await import('node:child_process')
  const { join } = await import('node:path')
  const arch = { 0: 'ia32', 1: 'x64', 2: 'armv7l', 3: 'arm64', 4: 'universal' }[context.arch]
  const platform = { win32: 'win', linux: 'linux', darwin: 'mac' }[context.electronPlatformName]
  execFileSync(
    process.execPath,
    ['--experimental-strip-types', join(__dirname, 'prepare-game-inspector.mjs'), platform, arch],
    {
      stdio: 'inherit',
      shell: false
    }
  )
}
