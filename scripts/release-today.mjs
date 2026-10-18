/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { releaseHelper } from './release-helper.mjs'
import {
  buildLocalRelease,
  preflightLocalRelease,
  submitLocalRelease
} from './local-release/build.mjs'
import { publishLocalDesktop } from './local-release/publish.mjs'
import { deployWebClient } from './release-web-client.mjs'

const local = process.argv.includes('--local')

/** @param {string[]} args @returns {string} */
function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

/** @param {string} message @returns {never} */
function fail(message) {
  console.error(message)
  process.exit(1)
}

try {
  if (git('status', '--porcelain')) {
    fail('Refusing to release with uncommitted changes. Commit or stash them first.')
  }

  const branch = git('branch', '--show-current')
  if (!branch) fail('Refusing to release from a detached HEAD.')
  if (local) await preflightLocalRelease()

  git('pull', '--ff-only')
  const helperConfigPath = resolve('helper-release.json')
  const originalHelperConfig = await readFile(helperConfigPath, 'utf8')
  const helperConfig = JSON.parse(originalHelperConfig)
  helperConfig.version = await releaseHelper(helperConfig, { local })
  await writeFile(helperConfigPath, `${JSON.stringify(helperConfig, null, 2)}\n`)
  // Keep the previous pin if verification fails, so retries can resume the helper release.
  try {
    execFileSync(
      'node',
      ['--experimental-strip-types', 'scripts/prepare-game-inspector.mjs', '--check-all'],
      { stdio: 'inherit' }
    )
  } catch (error) {
    await writeFile(helperConfigPath, originalHelperConfig)
    throw error
  }
  git('fetch', '--tags', '--quiet', 'origin')

  const now = new Date()
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  const day = String(now.getUTCDate()).padStart(2, '0')
  const dateCode = Number(`${month}${day}`)
  const versionPrefix = `${year}.${dateCode}`
  const existingTags = git('tag', '--list', `v${versionPrefix}.*`).split('\n')
  const revisionPattern = new RegExp(`^v${year}\\.${dateCode}\\.(\\d+)$`)
  const latestRevision = Math.max(
    0,
    ...existingTags.map((existingTag) => Number(revisionPattern.exec(existingTag)?.[1]) || 0)
  )
  const version = `${versionPrefix}.${latestRevision + 1}`
  const tag = `v${version}`

  execFileSync('node', ['scripts/generate-changelog.mjs', version], { stdio: 'inherit' })

  const packagePath = resolve('package.json')
  const lockPath = resolve('package-lock.json')
  const packageJson = JSON.parse(await readFile(packagePath, 'utf8'))
  const lockJson = JSON.parse(await readFile(lockPath, 'utf8'))

  packageJson.version = version
  lockJson.version = version
  if (lockJson.packages?.['']) lockJson.packages[''].version = version

  await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`)
  await writeFile(lockPath, `${JSON.stringify(lockJson, null, 2)}\n`)

  git('add', 'package.json', 'package-lock.json', 'CHANGELOG.md', 'helper-release.json')
  git('commit', '-m', `Release ${tag}${local ? ' [local-release]' : ''}`)
  git('tag', '-a', tag, '-m', `Release ${tag}`)
  git('push', 'origin', branch)
  git('push', 'origin', tag)

  console.log(
    local
      ? `${tag} pushed. Building desktop packages locally...`
      : `${tag} pushed. Waiting for GitHub Actions to build every desktop package...`
  )
  const releaseSha = git('rev-parse', 'HEAD')
  let dispatchedAt
  if (local) {
    const artifacts = await buildLocalRelease('desktop', process.cwd(), version, releaseSha)
    dispatchedAt = Date.now()
    await submitLocalRelease('keenplify/16competitive-client', tag, artifacts)
    await publishLocalDesktop(
      'keenplify/16competitive-client',
      tag,
      artifacts,
      releaseSha,
      process.cwd()
    )
  } else {
    dispatchedAt = Date.now()
    execFileSync('gh', ['workflow', 'run', 'release.yml', '--ref', tag], { stdio: 'inherit' })
  }
  const releaseDeadline = Date.now() + 60 * 60 * 1000
  let releaseUrl = ''
  let releaseCompleted = local
  while (!releaseCompleted && Date.now() < releaseDeadline) {
    const runs = JSON.parse(
      execFileSync(
        'gh',
        [
          'run',
          'list',
          '--workflow',
          local ? 'release-local.yml' : 'release.yml',
          '--branch',
          tag,
          '--limit',
          '10',
          '--json',
          'headSha,status,conclusion,url,createdAt'
        ],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
      )
    )
    const latest = runs.find(
      (entry) => entry.headSha === releaseSha && Date.parse(entry.createdAt) >= dispatchedAt - 1000
    )
    releaseUrl = latest?.url || releaseUrl
    if (latest?.status === 'completed') {
      if (latest.conclusion !== 'success') {
        fail(`Desktop release failed: ${latest.url}. Fix the workflow and rerun it.`)
      }
      console.log(`Desktop packages completed successfully${latest.url ? ` (${latest.url})` : ''}.`)
      releaseCompleted = true
      break
    }
    console.log(
      `Desktop ${tag}: ${latest?.status || 'waiting for Actions to start'}${latest?.url ? ` (${latest.url})` : ''}`
    )
    await new Promise((done) => setTimeout(done, 15_000))
  }
  if (!releaseCompleted) {
    fail(
      `Timed out waiting for desktop packages${releaseUrl ? `: ${releaseUrl}` : '.'} Check GitHub Actions before retrying.`
    )
  }

  deployWebClient(tag)
} catch (error) {
  if (error instanceof Error) {
    console.error(error.message)
  } else {
    console.error(String(error))
  }
  process.exit(1)
}
