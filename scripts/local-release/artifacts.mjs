/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { createHash } from 'node:crypto'
import { lstat, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { webHelperAssets } from '../web-helper-release.mjs'
import { helperRuntimeAssets } from '../sign-helper-runtime.mjs'

export const helperAssets = [
  'game-inspector-win-x64.exe',
  'game-inspector-linux-x64',
  'game-inspector-linux-arm64',
  'papamo-cosmetic-module-win-x86.dll',
  'papamo-cosmetic-module-linux-x86.so',
  'papamo-nextclient-client-mini-win-x86.dll'
]
export function expectedAssets(kind, version) {
  if (kind === 'helper') return helperAssets
  if (kind !== 'desktop' || !/^\d{4}\.\d{3,4}\.\d+$/.test(version))
    throw new Error('Invalid local artifact target')
  return [
    `16competitive-client-${version}-setup.exe`,
    `16competitive-client-${version}-setup.exe.blockmap`,
    `16competitive-client-${version}-x86_64.AppImage`,
    `16competitive-client-${version}-arm64.AppImage`,
    'latest.yml',
    'latest-linux.yml',
    'latest-linux-arm64.yml',
    `16competitive-client-${version}-renderer-win-x64.asar`,
    'renderer-update-win-x64.unsigned.json',
    ...webHelperAssets,
    ...helperRuntimeAssets.flatMap((name) => [name, `${name}.unsigned.json`])
  ]
}
export async function createArtifactManifest(
  directory,
  kind,
  version,
  commit,
  buildEnvironment = {}
) {
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error('Invalid source revision')
  const files = {}
  for (const name of expectedAssets(kind, version)) {
    const meta = await lstat(join(directory, name))
    if (!meta.isFile() || meta.isSymbolicLink() || meta.size === 0)
      throw new Error(`Invalid release asset: ${name}`)
    files[name] = {
      size: meta.size,
      sha256: createHash('sha256')
        .update(await readFile(join(directory, name)))
        .digest('hex')
    }
  }
  const manifest = { schemaVersion: 1, kind, version, commit, files, buildEnvironment }
  await writeFile(join(directory, 'local-build.json'), JSON.stringify(manifest, null, 2) + '\n')
  return manifest
}
export async function verifyArtifactManifest(directory, kind, version, commit) {
  const manifest = JSON.parse(await readFile(join(directory, 'local-build.json'), 'utf8'))
  if (
    manifest.schemaVersion !== 1 ||
    manifest.kind !== kind ||
    manifest.version !== version ||
    manifest.commit !== commit
  )
    throw new Error('Local build does not match the release tag and source revision')
  const expected = expectedAssets(kind, version).sort()
  if (
    JSON.stringify(Object.keys(manifest.files ?? {}).sort()) !== JSON.stringify(expected) ||
    JSON.stringify((await readdir(directory)).sort()) !==
      JSON.stringify([...expected, 'local-build.json'].sort())
  )
    throw new Error('Unexpected or missing local release assets')
  for (const name of expected) {
    const meta = await lstat(join(directory, name))
    const expectedFile = manifest.files[name]
    if (
      !meta.isFile() ||
      meta.isSymbolicLink() ||
      meta.size === 0 ||
      meta.size !== expectedFile.size ||
      createHash('sha256')
        .update(await readFile(join(directory, name)))
        .digest('hex') !== expectedFile.sha256
    )
      throw new Error(`Local release asset hash mismatch: ${name}`)
  }
  return manifest
}
