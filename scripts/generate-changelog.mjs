/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const version = process.argv[2]
if (!/^\d{4}\.\d{3,4}\.\d+$/.test(version ?? '')) {
  throw new Error('Version must use YYYY.MMDD.REVISION format.')
}

/** @param {string[]} args @returns {string} */
function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}
const changelogPath = resolve('CHANGELOG.md')
const changelog = await readFile(changelogPath, 'utf8').catch(() => '# Changelog\n')
const heading = `## v${version}`

/** @param {string} previousTag @param {string[]} commits @returns {Promise<string>} */
async function generateNotes(previousTag, commits) {
  const fallback =
    commits.length > 0
      ? commits.map((commit) => `- ${commit}`).join('\n')
      : '- Release maintenance.'
  let workspace
  try {
    workspace = await mkdtemp(join(tmpdir(), '16competitive-release-notes-'))
    const outputPath = join(workspace, 'notes.md')
    const diff = git('diff', '--stat', `${previousTag}..HEAD`)
    const prompt = `Write concise player-facing Markdown release notes from these changes. Return only Markdown bullets grouped under short ### headings. Do not include a release title, version, dates, implementation details, or claims not supported by the input.\n\nCommits:\n${commits.join('\n')}\n\nDiff summary:\n${diff}`
    execFileSync(
      'codex',
      ['exec', '--model', 'gpt-5.6-luna', '--output-last-message', outputPath, prompt],
      {
        stdio: 'inherit'
      }
    )
    const notes = (await readFile(outputPath, 'utf8')).trim()
    return notes || fallback
  } catch (error) {
    console.warn(
      `Could not generate AI release notes; using commit summaries instead: ${error instanceof Error ? error.message : String(error)}`
    )
    return fallback
  } finally {
    if (workspace) await rm(workspace, { recursive: true, force: true })
  }
}

if (!changelog.includes(heading)) {
  const previousTag = git('describe', '--tags', '--abbrev=0')
  const commits = git('log', `${previousTag}..HEAD`, '--pretty=format:%s')
    .split('\n')
    .filter(Boolean)
  const date = new Date().toISOString().slice(0, 10)
  const notes = await generateNotes(previousTag, commits)
  const entry = `\n${heading} — ${date}\n\n${notes}\n`
  await writeFile(changelogPath, `${changelog.trimEnd()}\n${entry}`)
}
