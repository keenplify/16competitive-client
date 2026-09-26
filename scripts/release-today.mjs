/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { releaseHelper } from './release-helper.mjs'

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

  git('pull', '--ff-only')
  const helperConfigPath = resolve('helper-release.json')
  const originalHelperConfig = await readFile(helperConfigPath, 'utf8')
  const helperConfig = JSON.parse(originalHelperConfig)
  helperConfig.version = await releaseHelper(helperConfig)
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
  git('commit', '-m', `Release ${tag}`)
  git('tag', '-a', tag, '-m', `Release ${tag}`)
  git('push', 'origin', branch)
  git('push', 'origin', tag)

  console.log(`${tag} pushed. Waiting for GitHub Actions to build every desktop package...`)
  const releaseSha = git('rev-parse', 'HEAD')
  const releaseDeadline = Date.now() + 60 * 60 * 1000
  let releaseUrl = ''
  let releaseCompleted = false
  while (Date.now() < releaseDeadline) {
    const runs = JSON.parse(
      execFileSync(
        'gh',
        [
          'run',
          'list',
          '--workflow',
          'release.yml',
          '--branch',
          tag,
          '--limit',
          '10',
          '--json',
          'headSha,status,conclusion,url'
        ],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
      )
    )
    const latest = runs.find((entry) => entry.headSha === releaseSha)
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

  const remoteCommand =
    'cd /root/16competitive && git pull --ff-only && DEPLOY_BUN_BIN=/root/.bun/bin/bun /root/.bun/bin/bun run web:build'
  const failedHosts = []

  const webHosts = process.env.RELEASE_WEB_HOSTS?.split(',').map((host) => host.trim()) ?? [
    'sg',
    'na',
    'ws',
    'india'
  ]
  if (webHosts.some((host) => !['sg', 'na', 'ws', 'india'].includes(host))) {
    fail('RELEASE_WEB_HOSTS must contain only sg, na, ws, or india.')
  }

  for (const host of webHosts) {
    console.log(`Updating web client on ${host}...`)
    try {
      execFileSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', host, remoteCommand], {
        stdio: 'inherit'
      })
    } catch {
      failedHosts.push(host)
      console.error(`Web client update failed on ${host}.`)
    }
  }

  if (failedHosts.length) {
    fail(`${tag} was pushed, but web client updates failed on: ${failedHosts.join(', ')}.`)
  }
} catch (error) {
  if (error instanceof Error) {
    console.error(error.message)
  } else {
    console.error(String(error))
  }
  process.exit(1)
}
