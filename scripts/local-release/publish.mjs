/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { execFileSync } from 'node:child_process'
import { createPrivateKey, createPublicKey, verify } from 'node:crypto'
import { copyFile, lstat, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { verifyArtifactManifest } from './artifacts.mjs'

export const credentialsPath = join(homedir(), '.config/16competitive-release/credentials.json')
async function privateFile(path) {
  const meta = await lstat(path)
  if (!meta.isFile() || meta.isSymbolicLink() || meta.uid !== process.getuid() || meta.mode & 0o077)
    throw new Error(`Release credential must be an owner-only regular file: ${path}`)
  return readFile(path, 'utf8')
}

export async function localSigningCredentials(publicKeyPem, path = credentialsPath) {
  let settings
  try {
    settings = JSON.parse(await privateFile(path))
  } catch {
    throw new Error(`Missing, invalid or insecure local signing credentials at ${path}`)
  }
  const origin = new URL(settings.registryUrl)
  if (
    origin.protocol !== 'https:' ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash
  )
    throw new Error('Local helper registry must be an HTTPS origin')
  if (typeof settings.publisherToken !== 'string' || settings.publisherToken.length < 32)
    throw new Error('Local helper publisher credential is missing')
  const privateKeyPem = await privateFile(settings.privateKeyPath)
  const privateKey = createPrivateKey(privateKeyPem)
  if (
    privateKey.asymmetricKeyType !== 'ed25519' ||
    !createPublicKey(privateKey)
      .export({ type: 'spki', format: 'der' })
      .equals(createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' }))
  )
    throw new Error('Local signing key does not match the client pinned Ed25519 public key')
  return { ...settings, privateKeyPem }
}

const run = (command, args, options = {}) =>
  execFileSync(command, args, { stdio: 'inherit', ...options })

export async function publishLocalHelper(repo, tag, artifacts, root, publicKeyPem) {
  const source = JSON.parse(await readFile(join(artifacts, 'local-build.json'), 'utf8'))
  const taggedCommit = execFileSync('git', ['rev-parse', `${tag}^{commit}`], {
    cwd: root,
    encoding: 'utf8'
  }).trim()
  if (source.commit !== taggedCommit)
    throw new Error('Local helper artifacts do not match the release tag')
  await verifyArtifactManifest(artifacts, 'helper', tag.slice(1), source.commit)
  const credentials = await localSigningCredentials(publicKeyPem)
  // Signed files live separately so the original build cache remains strictly verifiable.
  const signed = join(dirname(artifacts), 'signed')
  await rm(signed, { recursive: true, force: true })
  await mkdir(signed)
  for (const name of Object.keys(source.files))
    await copyFile(join(artifacts, name), join(signed, name))
  run(process.execPath, [join(root, 'scripts/sign-release.mjs'), signed], {
    env: { ...process.env, RELEASE_TAG: tag, HELPER_SIGNING_PRIVATE_KEY: credentials.privateKeyPem }
  })
  const manifests = []
  for (const name of [
    'game-inspector-win-x64.exe',
    'game-inspector-linux-x64',
    'game-inspector-linux-arm64'
  ]) {
    const path = join(signed, `${name}.manifest.json`)
    const envelope = JSON.parse(await readFile(path, 'utf8'))
    if (
      !verify(
        null,
        Buffer.from(envelope.manifest),
        publicKeyPem,
        Buffer.from(envelope.signature, 'base64')
      )
    )
      throw new Error(`Local signature verification failed: ${name}`)
    manifests.push(path)
  }
  run('gh', ['release', 'upload', tag, '--repo', repo, '--clobber', ...manifests])
  run(process.execPath, [join(root, 'scripts/register-release.mjs'), signed], {
    env: {
      ...process.env,
      HELPER_REGISTRY_URL: credentials.registryUrl,
      HELPER_RELEASE_PUBLISH_TOKEN: credentials.publisherToken
    }
  })
  run('gh', ['release', 'edit', tag, '--repo', repo, '--draft=false'])
  console.log(`Helper ${tag} signed, registered and published locally.`)
}

export async function publishLocalDesktop(repo, tag, artifacts, commit, root) {
  await verifyArtifactManifest(artifacts, 'desktop', tag.slice(1), commit)
  const notes = execFileSync(
    process.execPath,
    [join(root, 'scripts/extract-release-notes.mjs'), tag],
    { cwd: root, encoding: 'utf8' }
  )
  const notesPath = join(dirname(artifacts), 'release-notes.md')
  await writeFile(notesPath, notes)
  run('gh', ['release', 'edit', tag, '--repo', repo, '--draft=false', '--notes-file', notesPath])
  console.log(`Desktop ${tag} verified and published locally.`)
}
