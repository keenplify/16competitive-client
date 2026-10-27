/* eslint-disable @typescript-eslint/explicit-function-return-type */
// Linux integration: run after cargo build --manifest-path web-helper/Cargo.toml.
import assert from 'node:assert/strict'
import { spawn, spawnSync, execFileSync } from 'node:child_process'
import { mkdtemp, rm, mkdir, writeFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

if (process.platform !== 'linux') {
  console.log('Linux tray integration requires D-Bus; use Windows release tests on Windows.')
} else if (!process.argv.includes('--isolated-bus')) {
  const result = spawnSync(
    'dbus-run-session',
    ['--', process.execPath, fileURLToPath(import.meta.url), '--isolated-bus'],
    { stdio: 'inherit' }
  )
  assert.equal(result.status, 0)
} else {
  const directory = await mkdtemp(join(tmpdir(), '16c-tray-'))
  const exe = resolve('web-helper/target/debug/competitive16-web-helper')
  const bin = join(directory, 'bin')
  await mkdir(bin)
  for (const command of ['xdg-mime', 'update-desktop-database']) {
    await writeFile(join(bin, command), '#!/bin/sh\nexit 0\n', { mode: 0o700 })
  }
  const env = {
    ...process.env,
    XDG_CONFIG_HOME: directory,
    XDG_DATA_HOME: join(directory, 'data'),
    PATH: `${bin}:${process.env.PATH}`
  }
  const tray = spawn(exe, ['--tray'], { env, stdio: 'ignore' })
  const stopped = new Promise((resolve) => tray.once('exit', resolve))
  try {
    let name
    for (let i = 0; i < 60 && !name; i++) {
      const names = execFileSync(
        'gdbus',
        [
          'call',
          '--session',
          '--dest',
          'org.freedesktop.DBus',
          '--object-path',
          '/org/freedesktop/DBus',
          '--method',
          'org.freedesktop.DBus.ListNames'
        ],
        { encoding: 'utf8' }
      )
      name = names.match(/org\.kde\.StatusNotifierItem-\d+-\d+/)?.[0]
      if (!name) await delay(100)
    }
    assert.ok(name, 'Helper registers even when GNOME has no tray extension')
    const call = (path, method, ...args) =>
      execFileSync(
        'gdbus',
        [
          'call',
          '--session',
          '--dest',
          name,
          '--object-path',
          path,
          '--method',
          method,
          '--',
          ...args
        ],
        { encoding: 'utf8' }
      )
    assert.match(
      call(
        '/StatusNotifierItem',
        'org.freedesktop.DBus.Properties.Get',
        'org.kde.StatusNotifierItem',
        'Title'
      ),
      /1\.6 Competitive Helper/
    )
    const menu = call('/MenuBar', 'com.canonical.dbusmenu.GetLayout', '0', '-1', '[]')
    assert.match(menu, /Settings/)
    assert.match(menu, /Quit/)
    const duplicate = spawnSync(exe, ['--tray'], { env, timeout: 3000 })
    assert.equal(duplicate.status, 0)
    assert.equal(tray.exitCode, null, 'Duplicate invocation leaves existing tray alive')
    // Real setup returns to the shell while its detached worker installs and
    // reuses the resident tray. Protocol tools are isolated from the real desktop.
    for (let attempt = 0; attempt < 2; attempt++) {
      const setup = spawnSync(exe, [], { env, timeout: 3000 })
      assert.equal(setup.status, 0)
      assert.equal(setup.stdout.length, 0)
      await delay(300)
    }
    assert.equal((await readdir(join(directory, '16competitive/helper-versions'))).length, 1)
    assert.equal(tray.exitCode, null, 'Setup preserves the existing resident tray')
    call('/MenuBar', 'com.canonical.dbusmenu.Event', '3', 'clicked', '<0>', '0')
    assert.equal(await Promise.race([stopped, delay(3000).then(() => 'timeout')]), 0)
    console.log('Tray registration, menu, singleton and Quit passed on isolated D-Bus.')
  } finally {
    if (tray.exitCode === null) {
      tray.kill()
      await stopped
    }
    await rm(directory, { recursive: true, force: true })
  }
}
