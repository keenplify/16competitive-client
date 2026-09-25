/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export function nextHelperVersion(current, pinned) {
  const parse = (value) => {
    if (!/^\d{1,6}\.\d{1,6}\.\d{1,6}$/.test(value)) throw new Error('Invalid helper version')
    return value.split('.').map(Number)
  }
  const a = parse(current)
  const b = parse(pinned)
  const difference = a.map((value, i) => value - b[i]).find((value) => value !== 0) || 0
  if (difference < 0) throw new Error('Helper checkout is older than the client pin')
  if (difference > 0) return current
  if (a[2] >= 999999) throw new Error('Helper patch version exhausted')
  return `${a[0]}.${a[1]}.${a[2] + 1}`
}

export function bumpCargoFile(text, section, name, version) {
  let updated = false
  const result = text.replace(section, (block) => {
    if (!new RegExp(`^name = "${name}"$`, 'm').test(block)) return block
    if (!/^version = "[^"]+"$/m.test(block)) throw new Error('Cargo version missing')
    updated = true
    return block.replace(/^version = "[^"]+"$/m, `version = "${version}"`)
  })
  if (!updated) throw new Error(`Cargo package ${name} not found`)
  return result
}

export async function releaseHelper(config) {
  const cwd = resolve('../16competitive-helper')
  const run = (command, args, inherit = false) =>
    execFileSync(command, args, {
      cwd,
      encoding: 'utf8',
      stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
      timeout: 120000
    })?.trim()
  const git = (...args) => run('git', args)
  const repo = process.env.HELPER_REPOSITORY || config.repository
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo || '')) throw new Error('Invalid helper repository')
  if (!config.publicKeyPem) throw new Error('Configure the helper public signing key first')
  if (git('status', '--porcelain')) throw new Error('Commit or stash helper changes before release')
  const branch = git('branch', '--show-current')
  if (!branch) throw new Error('Helper checkout must be on a branch')
  const remote = git('remote', 'get-url', 'origin')
  if (
    ![
      `git@github.com:${repo}.git`,
      `git@github.com:${repo}`,
      `https://github.com/${repo}.git`,
      `https://github.com/${repo}`
    ].includes(remote)
  )
    throw new Error('Helper origin does not match the configured private repository')
  run('gh', ['auth', 'status', '--hostname', 'github.com'])
  git('pull', '--ff-only')
  git('fetch', '--tags', 'origin')
  const cargoPath = resolve(cwd, 'Cargo.toml')
  const lockPath = resolve(cwd, 'Cargo.lock')
  const cargo = await readFile(cargoPath, 'utf8')
  const lock = await readFile(lockPath, 'utf8')
  const current = /^version = "([^"]+)"/m.exec(cargo)?.[1]
  const version = nextHelperVersion(current, config.version)
  const tag = `v${version}`
  if (version !== current) {
    if (git('tag', '--list', tag))
      throw new Error(`${tag} already exists; reconcile helper versions first`)
    await writeFile(
      cargoPath,
      bumpCargoFile(cargo, /\[package\][\s\S]*?(?=\n\[|$)/g, 'game-inspector', version)
    )
    await writeFile(
      lockPath,
      bumpCargoFile(
        lock,
        /\[\[package\]\][\s\S]*?(?=\n\[\[package\]\]|$)/g,
        'game-inspector',
        version
      )
    )
    try {
      run('cargo', ['test', '--locked'], true)
    } catch (error) {
      await writeFile(cargoPath, cargo)
      await writeFile(lockPath, lock)
      throw error
    }
    git('add', 'Cargo.toml', 'Cargo.lock')
    git('commit', '-m', `Release helper ${tag}`)
  }
  const sha = git('rev-parse', 'HEAD')
  if (git('tag', '--list', tag)) {
    if (git('rev-parse', `${tag}^{commit}`) !== sha)
      throw new Error(`${tag} points to another commit; refusing to move an existing release tag`)
  } else {
    git('tag', '-a', tag, '-m', `Release helper ${tag}`)
  }
  git('push', 'origin', branch)
  git('push', 'origin', `refs/tags/${tag}`)
  console.log(`Waiting for private helper ${tag} to build, sign, and register...`)
  const deadline = Date.now() + 45 * 60 * 1000
  while (Date.now() < deadline) {
    const runs = JSON.parse(
      run('gh', [
        'run',
        'list',
        '--repo',
        repo,
        '--workflow',
        'release.yml',
        '--branch',
        tag,
        '--limit',
        '10',
        '--json',
        'headSha,status,conclusion,url'
      ])
    )
    const latest = runs.find((entry) => entry.headSha === sha)
    if (latest?.status === 'completed') {
      if (latest.conclusion !== 'success')
        throw new Error(
          `Helper release failed: ${latest.url}. Fix the failed job and rerun it, then retry npm run release; ${tag} will be reused.`
        )
      return version
    }
    console.log(
      `Helper ${tag}: ${latest?.status || 'waiting for Actions to start'}${latest?.url ? ` (${latest.url})` : ''}`
    )
    await new Promise((done) => setTimeout(done, 15000))
  }
  throw new Error(`Timed out waiting for ${tag}. Retry npm run release to resume.`)
}
