/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { execFileSync } from 'node:child_process'
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createArtifactManifest, expectedAssets, verifyArtifactManifest } from './artifacts.mjs'
import { releaseEnvironment } from './environment.mjs'
import { localSigningCredentials } from './publish.mjs'
import { webHelperAssets, webHelperReleaseChanges } from '../web-helper-release.mjs'

const clientRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const state = join(homedir(), '.local/share/16competitive-build')
const sshArgs = [
  '-o',
  'BatchMode=yes',
  '-o',
  'ConnectTimeout=10',
  '-p',
  '2222',
  '-i',
  join(state, 'windows/ssh-key'),
  '-o',
  `UserKnownHostsFile=${join(state, 'windows/known_hosts')}`,
  '-o',
  'StrictHostKeyChecking=yes',
  'build@127.0.0.1'
]
const run = (cmd, args, cwd = clientRoot, env = process.env) => {
  try {
    return execFileSync(cmd, args, { cwd, env, stdio: 'inherit', timeout: 7_200_000 })
  } catch (error) {
    throw new Error(
      `${cmd} failed (${error.status ?? error.code ?? 'unknown'}); see the output above.`
    )
  }
}
const capture = (cmd, args, cwd = clientRoot) =>
  execFileSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000
  }).trim()
const powershell = (code) =>
  run('ssh', [
    ...sshArgs,
    'powershell.exe',
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-EncodedCommand',
    Buffer.from("$ProgressPreference='SilentlyContinue';" + code, 'utf16le').toString('base64')
  ])
const scpArgs = [
  '-P',
  '2222',
  '-i',
  join(state, 'windows/ssh-key'),
  '-o',
  'BatchMode=yes',
  '-o',
  `UserKnownHostsFile=${join(state, 'windows/known_hosts')}`,
  '-o',
  'StrictHostKeyChecking=yes'
]
const images = ['helper-x64', 'helper-arm64', 'desktop']
async function container(image, source, cmd, args, approved, buildEnv = {}) {
  const cache = join(state, 'cache')
  await mkdir(cache, { recursive: true })
  run('docker', [
    'run',
    '--rm',
    '--user',
    `${process.getuid()}:${process.getgid()}`,
    '-e',
    'HOME=/tmp',
    '-e',
    'CARGO_HOME=/cache/cargo',
    '-e',
    'npm_config_cache=/cache/npm',
    '-e',
    'CSC_IDENTITY_AUTO_DISCOVERY=false',
    '-e',
    'APPIMAGE_EXTRACT_AND_RUN=1',
    '-v',
    `${cache}:/cache:z`,
    '-v',
    `${source}:/source:Z`,
    ...(approved
      ? ['-v', `${approved}:/approved:ro,Z`, '-e', 'LOCAL_HELPER_ASSET_DIR=/approved']
      : []),
    ...Object.entries(buildEnv).flatMap(([key, value]) => ['-e', `${key}=${value}`]),
    `16c-release-${image}`,
    cmd,
    ...args
  ])
}

export async function preflightLocalRelease() {
  await releaseEnvironment(clientRoot)
  const helper = JSON.parse(await readFile(join(clientRoot, 'helper-release.json'), 'utf8'))
  await localSigningCredentials(helper.publicKeyPem)
  if (process.platform !== 'linux' || process.arch !== 'x64')
    throw new Error('Local release currently requires the configured Fedora x64 build host')
  if (
    capture('virsh', ['-c', 'qemu:///session', 'domstate', '16competitive-build-win11']) ===
    'shut off'
  )
    run('virsh', ['-c', 'qemu:///session', 'start', '16competitive-build-win11'])
  capture('docker', ['info', '--format', '{{.ServerVersion}}'])
  for (const image of images) capture('docker', ['image', 'inspect', `16c-release-${image}`])
  capture('gh', ['auth', 'status', '--hostname', 'github.com'])
  const vmDeadline = Date.now() + 180_000
  while (true) {
    try {
      powershell(
        "$env:Path='C:\\16c-build\\tools\\node;C:\\Program Files\\Git\\cmd;'+$env:USERPROFILE+'\\.cargo\\bin;'+$env:Path; $ErrorActionPreference='Stop'; if (!(Test-Path C:\\16c-build\\ready)) { throw 'Windows build tools are not ready' }; node --version; cargo --version; git --version"
      )
      break
    } catch {
      if (Date.now() >= vmDeadline) {
        throw new Error(
          'Windows build tools are not ready or VM SSH is unavailable. Finish Windows setup and check C:\\16c-build\\bootstrap.log; see docs/local-release.md.'
        )
      }
      console.log('Waiting for the Windows build VM to finish starting...')
      await new Promise((done) => setTimeout(done, 5000))
    }
  }
}

export async function buildLocalRelease(kind, root, version, commit) {
  if (!['helper', 'desktop'].includes(kind) || !/^[0-9a-f]{40}$/.test(commit))
    throw new Error('Invalid local build')
  const job = join(state, 'jobs', `${kind}-${commit}`)
  const source = join(job, 'source')
  const artifacts = join(job, 'artifacts')
  const buildEnv = kind === 'desktop' ? await releaseEnvironment(root) : {}
  await mkdir(job, { recursive: true })
  // Reuse only a complete, hash-verified build of the identical commit.
  try {
    const manifest = await verifyArtifactManifest(artifacts, kind, version, commit)
    if (JSON.stringify(manifest.buildEnvironment ?? {}) === JSON.stringify(buildEnv))
      return artifacts
  } catch {
    /* build a missing or invalid cache */
  }
  await rm(source, { recursive: true, force: true })
  await mkdir(source)
  const archive = join(job, 'source.tar')
  run('git', ['archive', '--format=tar', '-o', archive, commit], root)
  run('tar', ['-xf', archive, '-C', source])
  await rm(artifacts, { recursive: true, force: true })
  await mkdir(artifacts)
  let buildWebHelper = false
  if (kind === 'desktop') {
    const changes = webHelperReleaseChanges(root, commit)
    buildWebHelper = changes.changed
    if (!buildWebHelper && changes.previousTag) {
      try {
        for (const name of webHelperAssets)
          run('gh', [
            'release',
            'download',
            changes.previousTag,
            '--repo',
            'keenplify/16competitive-client',
            '--pattern',
            name,
            '--dir',
            artifacts
          ])
        console.log(`Reusing web helper binaries from ${changes.previousTag}.`)
      } catch {
        buildWebHelper = true
        console.log('Previous web helper artifacts are unavailable; rebuilding.')
      }
    }
    if (buildWebHelper) console.log('Building changed web helper for this desktop release.')
  }
  const guest = `C:/16c-build/jobs/${kind}-${commit}`
  powershell(`New-Item -ItemType Directory -Force '${guest}' | Out-Null`)
  run('scp', [
    ...scpArgs,
    join(clientRoot, 'scripts/local-release/windows-prune.ps1'),
    `build@127.0.0.1:${guest}/`
  ])
  powershell(`& '${guest}/windows-prune.ps1' -CurrentJob '${kind}-${commit}'; if (!$?) { exit 1 }`)
  run('scp', [
    ...scpArgs,
    archive,
    join(clientRoot, 'scripts/local-release/windows-build.ps1'),
    `build@127.0.0.1:${guest}/`
  ])
  if (kind === 'desktop') {
    const envPath = join(job, 'build-environment.json')
    await writeFile(envPath, JSON.stringify(buildEnv), { mode: 0o600 })
    run('scp', [...scpArgs, envPath, `build@127.0.0.1:${guest}/`])
  }
  if (kind === 'helper') {
    await container('helper-x64', source, 'cmake', [
      '-S',
      'nextclient/tests',
      '-B',
      'target/match-handoff-tests'
    ])
    await container('helper-x64', source, 'cmake', ['--build', 'target/match-handoff-tests'])
    await container('helper-x64', source, 'ctest', [
      '--test-dir',
      'target/match-handoff-tests',
      '--output-on-failure'
    ])
    await container('helper-x64', source, 'cargo', ['test', '--locked'])
    await container('helper-x64', source, 'cargo', [
      'test',
      '--locked',
      '-p',
      'papamo-cosmetic-module'
    ])
    for (const target of ['x86_64-unknown-linux-gnu', 'aarch64-unknown-linux-gnu']) {
      await container(
        target.startsWith('aarch64') ? 'helper-arm64' : 'helper-x64',
        source,
        'cargo',
        ['build', '--locked', '--release', '--features', 'cosmetic-probe', '--target', target]
      )
      await copyFile(
        join(source, 'target', target, 'release/game-inspector'),
        join(artifacts, `game-inspector-linux-${target.startsWith('aarch64') ? 'arm64' : 'x64'}`)
      )
    }
    await container('helper-x64', source, 'cargo', [
      'build',
      '--locked',
      '--release',
      '-p',
      'papamo-cosmetic-module',
      '--target',
      'i686-unknown-linux-gnu'
    ])
    await copyFile(
      join(source, 'target/i686-unknown-linux-gnu/release/libpapamo_cosmetic_module.so'),
      join(artifacts, 'papamo-cosmetic-module-linux-x86.so')
    )
  } else {
    const helper = JSON.parse(await readFile(join(source, 'helper-release.json'), 'utf8'))
    const approved = join(job, 'approved-helper')
    await rm(approved, { recursive: true, force: true })
    await mkdir(approved)
    run('gh', [
      'release',
      'download',
      `v${helper.version}`,
      '--repo',
      helper.repository,
      '--dir',
      approved
    ])
    if (buildWebHelper) {
      await container('desktop', source, 'npm', ['ci'], approved, buildEnv)
      await container(
        'desktop',
        source,
        'node',
        ['--experimental-strip-types', 'scripts/prepare-game-inspector.mjs', 'linux', 'x64'],
        approved,
        buildEnv
      )
      await container('helper-x64', source, 'cargo', [
        'test',
        '--manifest-path',
        'web-helper/Cargo.toml',
        '--locked'
      ])
      await container('helper-x64', source, 'cargo', [
        'build',
        '--manifest-path',
        'web-helper/Cargo.toml',
        '--release',
        '--locked'
      ])
      await copyFile(
        join(source, 'web-helper/target/release/competitive16-web-helper'),
        join(artifacts, 'competitive16-web-helper-linux')
      )
      await container(
        'desktop',
        source,
        'node',
        ['--experimental-strip-types', 'scripts/prepare-game-inspector.mjs', 'linux', 'arm64'],
        approved,
        buildEnv
      )
      await container('helper-arm64', source, 'cargo', [
        'build',
        '--manifest-path',
        'web-helper/Cargo.toml',
        '--release',
        '--locked',
        '--target',
        'aarch64-unknown-linux-gnu'
      ])
      await copyFile(
        join(
          source,
          'web-helper/target/aarch64-unknown-linux-gnu/release/competitive16-web-helper'
        ),
        join(artifacts, 'competitive16-web-helper-linux-arm64')
      )
    }
    run('scp', [...scpArgs, '-r', approved, `build@127.0.0.1:${guest}/`])
    if (!buildWebHelper) await container('desktop', source, 'npm', ['ci'], approved, buildEnv)
    for (const command of ['build:linux', 'build:linux:arm64']) {
      await container('desktop', source, 'npm', ['run', command], approved, buildEnv)
      if (command === 'build:linux') {
        await container(
          'desktop',
          source,
          'node',
          ['scripts/package-helper-runtime.mjs', 'dist/linux-unpacked', 'dist', 'linux'],
          approved,
          buildEnv
        )
      } else {
        await container(
          'desktop',
          source,
          'node',
          ['scripts/package-helper-runtime.mjs', 'dist/linux-arm64-unpacked', 'dist', 'linux', 'arm64'],
          approved,
          buildEnv
        )
      }
      await container(
        'desktop',
        source,
        'node',
        ['--experimental-strip-types', 'scripts/check-release-backend.mjs'],
        approved,
        buildEnv
      )
      for (const name of await readdir(join(source, 'dist')))
        if (expectedAssets(kind, version).includes(name))
          await copyFile(join(source, 'dist', name), join(artifacts, name))
    }
  }
  powershell(
    `& '${guest}/windows-build.ps1' -Kind '${kind}' -Commit '${commit}' -BuildWebHelper $${buildWebHelper ? 'true' : 'false'}; if (!$?) { exit 1 }`
  )
  run('scp', [...scpArgs, `build@127.0.0.1:${guest}/artifacts/*`, artifacts])
  await createArtifactManifest(artifacts, kind, version, commit, buildEnv)
  await verifyArtifactManifest(artifacts, kind, version, commit)
  return artifacts
}

export async function submitLocalRelease(repo, tag, directory) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !/^v[0-9.]+$/.test(tag))
    throw new Error('Invalid release identity')
  let release
  try {
    release = JSON.parse(
      capture('gh', ['release', 'view', tag, '--repo', repo, '--json', 'isDraft'])
    )
  } catch {
    /* create draft */
  }
  if (release && !release.isDraft) throw new Error('Refusing to overwrite published release assets')
  if (!release)
    run('gh', [
      'release',
      'create',
      tag,
      '--repo',
      repo,
      '--verify-tag',
      '--draft',
      '--title',
      tag,
      '--notes',
      'Locally built artifacts awaiting verified publication.'
    ])
  const names = await readdir(directory)
  run('gh', [
    'release',
    'upload',
    tag,
    '--repo',
    repo,
    '--clobber',
    ...names.map((name) => join(directory, name))
  ])
}
