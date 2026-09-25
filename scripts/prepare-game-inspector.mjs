/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { execFileSync } from 'node:child_process'
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  verifyHelperRelease,
  verifyHelperBinary
} from '../src/main/anticheat/helper-release-verifier.ts'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const config = JSON.parse(await readFile(join(root, 'helper-release.json'), 'utf8'))
if (!config.publicKeyPem || !/^\d{1,6}\.\d{1,6}\.\d{1,6}$/.test(config.version))
  throw new Error(
    'Configure helper-release.json with the pinned helper version and Ed25519 PUBLIC key. See docs/native-game-inspector.md.'
  )
const registry = new URL(config.registryUrl)
if (
  registry.protocol !== 'https:' ||
  registry.username ||
  registry.password ||
  registry.pathname !== '/' ||
  registry.search ||
  registry.hash
)
  throw new Error('Helper registry must be an HTTPS origin')
const repo = process.env.HELPER_REPOSITORY || config.repository
if (!repo || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo))
  throw new Error(
    'Set repository in helper-release.json (or HELPER_REPOSITORY) to owner/private-helper-repo.'
  )

try {
  execFileSync('gh', ['auth', 'status', '--hostname', 'github.com'], {
    stdio: 'pipe',
    shell: false
  })
} catch {
  throw new Error(
    'GitHub CLI authentication is required to download the private helper. Run gh auth login once, or provide GH_TOKEN with read access to the helper repository.'
  )
}
console.log(`Checking signed helper v${config.version} from ${repo}...`)

async function prepare(platform, arch, checkOnly) {
  if (!['win-x64', 'linux-x64', 'linux-arm64'].includes(`${platform}-${arch}`))
    throw new Error(`No approved helper target for ${platform}-${arch}`)
  const asset = `game-inspector-${platform}-${arch}${platform === 'win' ? '.exe' : ''}`
  const temporary = await mkdtemp(join(tmpdir(), 'competitive-helper-'))
  try {
    execFileSync(
      'gh',
      [
        'release',
        'download',
        `v${config.version}`,
        '--repo',
        repo,
        '--pattern',
        asset,
        '--pattern',
        `${asset}.manifest.json`,
        '--dir',
        temporary
      ],
      { stdio: 'inherit', shell: false }
    )
    const envelope = JSON.parse(await readFile(join(temporary, `${asset}.manifest.json`), 'utf8'))
    const manifest = verifyHelperRelease(envelope, config.publicKeyPem)
    if (
      manifest.version !== config.version ||
      manifest.platform !== platform ||
      manifest.arch !== arch
    )
      throw new Error('Helper release does not match the pinned version and target')
    verifyHelperBinary(await readFile(join(temporary, asset)), manifest)
    const response = await fetch(
      new URL(`/helper-releases/${config.version}/${platform}/${arch}`, registry),
      {
        signal: AbortSignal.timeout(10000),
        redirect: 'error',
        cache: 'no-store'
      }
    )
    if (!response.ok) throw new Error(`Helper is not approved by backend (HTTP ${response.status})`)
    const approved = await response.json()
    verifyHelperRelease(approved, config.publicKeyPem)
    if (approved.manifest !== envelope.manifest || approved.signature !== envelope.signature)
      throw new Error('Backend approval differs from the downloaded signed release')
    if (!checkOnly) {
      const destination = join(root, 'resources', 'native', `${platform}-${arch}`)
      await mkdir(destination, { recursive: true })
      const binary = join(destination, platform === 'win' ? 'game-inspector.exe' : 'game-inspector')
      await copyFile(join(temporary, asset), binary)
      await writeFile(join(destination, 'manifest.json'), JSON.stringify(envelope) + '\n')
      if (platform !== 'win') await chmod(binary, 0o755)
    }
    console.log(`Verified approved helper ${config.version} (${platform}-${arch}).`)
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}

if (process.argv[2] === '--check-all') {
  for (const [platform, arch] of [
    ['win', 'x64'],
    ['linux', 'x64'],
    ['linux', 'arm64']
  ])
    await prepare(platform, arch, true)
} else {
  await prepare(
    process.argv[2] || (process.platform === 'win32' ? 'win' : process.platform),
    process.argv[3] || process.arch,
    false
  )
}
