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

  const now = new Date()
  const version = `${now.getUTCFullYear()}.${now.getUTCMonth() + 1}.${now.getUTCDate()}`
  const tag = `v${version}`

  try {
    git('rev-parse', '--verify', '--quiet', `refs/tags/${tag}`)
    fail(`Tag ${tag} already exists. Calendar versioning permits one release per UTC day.`)
  } catch (error) {
    if (error?.status !== 1) throw error
  }

  const packagePath = resolve('package.json')
  const lockPath = resolve('package-lock.json')
  const packageJson = JSON.parse(await readFile(packagePath, 'utf8'))
  const lockJson = JSON.parse(await readFile(lockPath, 'utf8'))

  packageJson.version = version
  lockJson.version = version
  if (lockJson.packages?.['']) lockJson.packages[''].version = version

  await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`)
  await writeFile(lockPath, `${JSON.stringify(lockJson, null, 2)}\n`)

  git('add', 'package.json', 'package-lock.json')
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
