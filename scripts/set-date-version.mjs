import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const suppliedVersion = process.argv[2]
const now = new Date()
const version =
  suppliedVersion ?? `${now.getUTCFullYear()}.${now.getUTCMonth() + 1}.${now.getUTCDate()}`
const match = /^(\d{4})\.(\d{1,2})\.(\d{1,2})$/.exec(version)

if (!match) throw new Error('Version must use YYYY.M.D format, for example 2026.9.3.')

const [, year, month, day] = match.map(Number)
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
