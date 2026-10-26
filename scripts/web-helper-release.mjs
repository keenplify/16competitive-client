/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const webHelperAssets = ['competitive16-web-helper.exe', 'competitive16-web-helper-linux']

/** The shared launch pattern is part of the Rust binary and must trigger a rebuild. */
export function webHelperReleaseChanges(root, commit = 'HEAD') {
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim()
  let previousTag
  try {
    previousTag = git('describe', '--tags', '--abbrev=0', `${commit}^`)
  } catch {
    return { changed: true, previousTag: null }
  }
  try {
    execFileSync(
      'git',
      [
        'diff',
        '--quiet',
        previousTag,
        commit,
        '--',
        'web-helper',
        'src/shared/web-game-launch-pattern.json',
        'src/shared/windows-client-exports.json',
        'src/shared/windows-goldclient-exports.json',
        'helper-release.json'
      ],
      { cwd: root, stdio: 'ignore' }
    )
    return { changed: false, previousTag }
  } catch (error) {
    if (error.status === 1) return { changed: true, previousTag }
    throw error
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = webHelperReleaseChanges(process.cwd())
  if (process.env.GITHUB_OUTPUT) {
    const { appendFileSync } = await import('node:fs')
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `changed=${result.changed}\nprevious_tag=${result.previousTag ?? ''}\n`
    )
  }
  console.log(
    `Web helper source ${result.changed ? 'changed; rebuild required' : 'unchanged; reuse prior asset if available'}${result.previousTag ? ` since ${result.previousTag}` : ''}.`
  )
}
