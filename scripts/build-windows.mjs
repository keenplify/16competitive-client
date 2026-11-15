/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { execFileSync } from 'node:child_process'
import { createHash, createPrivateKey, createPublicKey } from 'node:crypto'
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { releaseEnvironment } from './local-release/environment.mjs'
import { signWebHelperUpdates } from './sign-web-helper-update.mjs'
import { signHelperRuntimes } from './sign-helper-runtime.mjs'
import { signRendererUpdate } from './sign-renderer-update.mjs'

if (process.platform !== 'win32') throw new Error('Native Windows build requires Windows')
if (Number(process.versions.node.split('.')[0]) < 24)
  throw new Error('Node 24 or newer is required')
const root = process.cwd()
const run = (command, args, env = process.env) =>
  execFileSync(command, args, { cwd: root, env, stdio: 'inherit' })
const capture = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
if (capture('status', '--porcelain'))
  throw new Error('Commit source changes before creating signed build artifacts')
const commit = capture('rev-parse', 'HEAD')
const credentials = JSON.parse(await readFile(resolve(process.argv[2]), 'utf8'))
const privateKey = createPrivateKey(await readFile(credentials.privateKeyPath))
const { publicKeyPem } = JSON.parse(await readFile('helper-release.json', 'utf8'))
if (
  privateKey.asymmetricKeyType !== 'ed25519' ||
  !createPublicKey(privateKey)
    .export({ type: 'spki', format: 'der' })
    .equals(createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' }))
)
  throw new Error('Signing key does not match pinned identity')
const { version } = JSON.parse(await readFile('package.json', 'utf8'))
const env = { ...process.env, ...(await releaseEnvironment(root, {})) }
const npm = join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')
run(process.execPath, [npm, 'ci'], env)
run(process.execPath, [npm, 'run', 'prepare:helper', '--', 'win', 'x64'], env)
for (const task of ['verify', 'verify:web', 'test:helper', 'test:scoreboard', 'test:launcher'])
  run(process.execPath, [npm, 'run', task], env)
run(process.execPath, [npm, 'run', 'build:session-helper', '--', '--release'], env)
run(process.execPath, [npm, 'run', 'build:win'], env)
run(process.execPath, ['--experimental-strip-types', 'scripts/check-release-backend.mjs'], env)
run(
  process.execPath,
  ['scripts/package-helper-runtime.mjs', 'dist/win-unpacked', 'dist', 'win'],
  env
)
await copyFile(
  'web-helper/target/release/competitive16-web-helper.exe',
  'dist/competitive16-web-helper.exe'
)
const output = join(root, 'dist', `windows-${version}-${commit.slice(0, 8)}`)
await mkdir(output, { recursive: true })
const names = [
  `16competitive-client-${version}-setup.exe`,
  `16competitive-client-${version}-setup.exe.blockmap`,
  `16competitive-client-${version}-renderer-win-x64.asar`,
  'latest.yml',
  'competitive16-web-helper.exe',
  'helper-runtime-win-x64.tar.gz',
  'helper-runtime-win-x64.tar.gz.unsigned.json',
  'renderer-update-win-x64.unsigned.json'
]
for (const name of names) await copyFile(join(root, 'dist', name), join(output, name))
await signWebHelperUpdates(output, output, version, privateKey, publicKeyPem, [
  'competitive16-web-helper.exe'
])
await signHelperRuntimes(output, output, version, privateKey, publicKeyPem, [
  'helper-runtime-win-x64.tar.gz'
])
await signRendererUpdate(output, output, version, privateKey, publicKeyPem)
const files = {}
for (const name of await readdir(output)) {
  if (name === 'windows-build.json') continue
  const bytes = await readFile(join(output, name))
  files[name] = { size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
}
await writeFile(
  join(output, 'windows-build.json'),
  JSON.stringify(
    { schemaVersion: 1, version, commit, platform: 'win', arch: 'x64', published: false, files },
    null,
    2
  ) + '\n'
)
console.log(`Verified and signed native Windows build: ${output}. Nothing was published.`)
