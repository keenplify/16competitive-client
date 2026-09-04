/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

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

  git('add', 'package.json', 'package-lock.json', 'CHANGELOG.md')
  git('commit', '-m', `Release ${tag}`)
  git('tag', '-a', tag, '-m', `Release ${tag}`)
  git('push', 'origin', branch)
  git('push', 'origin', tag)

  console.log(`${tag} pushed. GitHub Actions will build it and create the GitHub Release.`)
} catch (error) {
  if (error instanceof Error) {
    console.error(error.message)
  } else {
    console.error(String(error))
  }
  process.exit(1)
}
