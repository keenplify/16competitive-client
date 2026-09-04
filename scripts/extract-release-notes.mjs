import { readFile } from 'node:fs/promises'

const tag = process.argv[2]
if (!/^v\d{4}\.\d{3,4}\.\d+$/.test(tag ?? '')) {
  throw new Error('Expected a release tag in the form vYYYY.MMDD.REVISION.')
}

const changelog = await readFile('CHANGELOG.md', 'utf8')
const heading = new RegExp(`^## ${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*$`, 'm')
const match = heading.exec(changelog)
if (!match || match.index === undefined) {
  throw new Error(`No changelog entry found for ${tag}.`)
}

const contentStart = match.index + match[0].length
const nextHeading = changelog.indexOf('\n## ', contentStart)
const notes = changelog.slice(contentStart, nextHeading === -1 ? undefined : nextHeading).trim()
if (!notes) throw new Error(`Changelog entry for ${tag} has no release notes.`)

console.log(notes)
