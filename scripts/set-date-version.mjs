import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const suppliedVersion = process.argv[2]
const now = new Date()
const todayDateCode = Number(
  `${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`
)
const version = suppliedVersion ?? `${now.getUTCFullYear()}.${todayDateCode}.1`
const match = /^(\d{4})\.(\d{3,4})\.(\d+)$/.exec(version)

if (!match) throw new Error('Version must use YYYY.MMDD.REVISION format, for example 2026.903.1.')

const [, year, rawDateCode, revision] = match.map(Number)
if (revision < 1) throw new Error('Release revision must be at least 1.')

const dateCode = String(rawDateCode).padStart(4, '0')
const month = Number(dateCode.slice(0, 2))
const day = Number(dateCode.slice(2, 4))
const parsed = new Date(Date.UTC(year, month - 1, day))
if (
  parsed.getUTCFullYear() !== year ||
  parsed.getUTCMonth() !== month - 1 ||
  parsed.getUTCDate() !== day
) {
  throw new Error(`Not a valid calendar date: ${version}`)
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

console.log(`Version set to ${version}. Commit it, then create and push v${version}.`)
