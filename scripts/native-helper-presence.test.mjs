/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import net from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'

if (process.platform === 'linux' && !process.argv.includes('--isolated-bus')) {
  const result = spawnSync(
    'dbus-run-session',
    ['--', process.execPath, fileURLToPath(import.meta.url), '--isolated-bus'],
    { stdio: 'inherit' }
  )
  assert.equal(result.status, 0)
} else {
  const root = await mkdtemp(join(tmpdir(), '16c-presence-'))
  const config = join(root, '16competitive')
  await mkdir(config)
  const pipe =
    process.platform === 'win32'
      ? [
          String.fromCharCode(92, 92),
          '.',
          String.fromCharCode(92),
          'pipe',
          String.fromCharCode(92),
          `16c-discord-test-${process.pid}`
        ].join('')
      : join(root, 'discord-ipc-0')
  const binary =
    process.env.NATIVE_HELPER_TEST_BINARY ??
    resolve(
      `web-helper/target/debug/competitive16-web-helper${process.platform === 'win32' ? '.exe' : ''}`
    )
  if (process.platform === 'win32') {
    const pe = await readFile(binary)
    assert.equal(
      pe.readUInt16LE(pe.readUInt32LE(0x3c) + 24 + 68),
      2,
      'Helper uses the GUI subsystem without a console'
    )
  }
  const frames = []
  let socket
  const server = net.createServer((peer) => {
    socket = peer
    let buffer = Buffer.alloc(0)
    peer.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk])
      while (buffer.length >= 8 && buffer.length >= 8 + buffer.readUInt32LE(4)) {
        const size = buffer.readUInt32LE(4),
          op = buffer.readUInt32LE(0)
        const body = JSON.parse(buffer.subarray(8, 8 + size).toString())
        frames.push({ op, body })
        buffer = buffer.subarray(8 + size)
        if (op === 0) setTimeout(() => write(peer, 1, { evt: 'READY', data: {} }), 150)
      }
    })
    peer.on('error', () => {})
  })
  function write(peer, op, value) {
    const body = Buffer.from(JSON.stringify(value)),
      header = Buffer.alloc(8)
    header.writeUInt32LE(op, 0)
    header.writeUInt32LE(body.length, 4)
    peer.write(Buffer.concat([header, body]))
  }
  await new Promise((resolve) => server.listen(pipe, resolve))
  const env = { ...process.env, XDG_CONFIG_HOME: root, LOCALAPPDATA: root, DISCORD_IPC_PATH: pipe }
  const tray = spawn(binary, ['--tray'], { env, windowsHide: true, stdio: 'ignore' })
  const exited = new Promise((resolve) => tray.once('exit', resolve))
  let endpoint
  const wait = async (predicate, label) => {
    for (let i = 0; i < 100; i++) {
      if (await predicate()) return
      await delay(50)
    }
    throw new Error(`Timed out: ${label}`)
  }
  try {
    await wait(async () => {
      try {
        endpoint = JSON.parse(await readFile(join(config, 'presence.endpoint'), 'utf8'))
        return true
      } catch {
        return false
      }
    }, 'broker ready')
    const publish = (activity, token = endpoint.token) =>
      new Promise((resolve, reject) => {
        const peer = net.connect(endpoint.port, '127.0.0.1')
        peer.setTimeout(1000, () => peer.destroy(new Error('Broker timeout')))
        let bytes = ''
        peer.on('connect', () =>
          peer.write(JSON.stringify({ token, source: 'b'.repeat(64), activity }) + '\n')
        )
        peer.on('data', (chunk) => {
          bytes += chunk
          if (bytes.includes('\n')) {
            peer.end()
            resolve(JSON.parse(bytes))
          }
        })
        peer.on('error', reject)
        peer.on('end', () => {
          if (!bytes) reject(new Error('Capability rejected'))
        })
      })
    const base = {
      phase: 'lobby',
      mode: '5v5',
      map: 'de_dust2',
      partyId: '12345678-1234-4234-8234-123456789abc',
      partySize: 2,
      joinSecret: '22345678-1234-4234-8234-123456789abc',
      startedAt: null
    }
    await assert.rejects(() => publish(base, 'bad-token'))
    await publish(base)
    await wait(
      () =>
        frames.some(
          ({ body }) => body.cmd === 'SET_ACTIVITY' && body.args.activity?.details === 'In Lobby'
        ),
      'delayed READY and lobby'
    )
    const handshake = frames.find(({ op }) => op === 0)
    assert.equal(handshake.body.client_id, '1551415053084004402')
    const count = frames.filter(({ body }) => body.cmd === 'SET_ACTIVITY').length
    await publish(base)
    await delay(250)
    assert.equal(
      frames.filter(({ body }) => body.cmd === 'SET_ACTIVITY').length,
      count,
      'Identical keepalives do not spam Discord'
    )
    await publish({ ...base, phase: 'queue', joinSecret: null })
    await wait(
      () => frames.some(({ body }) => body.args?.activity?.details === 'Searching for Match'),
      'queue activity'
    )
    await publish({ ...base, phase: 'game', joinSecret: null, startedAt: 1800000000 })
    await wait(
      () => frames.some(({ body }) => body.args?.activity?.details === 'Competitive • In Game'),
      'game activity'
    )
    const game = frames.find(({ body }) => body.args?.activity?.details === 'Competitive • In Game')
      .body.args.activity
    assert.equal(game.secrets, undefined)
    assert.equal(game.timestamps.start, 1800000000)
    write(socket, 3, { nonce: 'ping' })
    await wait(
      () => frames.some(({ op, body }) => op === 4 && body.nonce === 'ping'),
      'Discord ping/pong'
    )
    write(socket, 1, { evt: 'ACTIVITY_JOIN', data: { secret: base.joinSecret } })
    await delay(100)
    assert.equal((await publish(base)).joinSecret, base.joinSecret)
    assert.equal((await publish(base)).joinSecret, null, 'Join callback consumed once')
    await publish(null)
    await wait(
      () => frames.some(({ body }) => body.cmd === 'SET_ACTIVITY' && body.args.activity === null),
      'logout clears status'
    )
    const invalid = Buffer.alloc(8)
    invalid.writeUInt32LE(1, 0)
    invalid.writeUInt32LE(1000000, 4)
    socket.write(invalid)
    await wait(async () => !(await publish(null)).connected, 'oversized frame is rejected')
    assert.equal(tray.exitCode, null, 'Bad Discord IPC cannot stop the helper')
    console.log(
      'Native Discord lifecycle, delayed READY, deduplication, join, clear, ping and IPC bounds passed.'
    )
  } catch (error) {
    console.error(
      'Received Discord opcodes/commands:',
      frames.map(({ op, body }) => ({ op, cmd: body.cmd, evt: body.evt }))
    )
    try {
      console.error('Native diagnostics:', await readFile(join(config, 'discord-rpc.log'), 'utf8'))
    } catch {
      /* The peer may already have disconnected. */
    }
    throw error
  } finally {
    if (tray.exitCode === null) tray.kill()
    await exited
    socket?.destroy()
    await new Promise((resolve) => server.close(resolve))
    await rm(root, { recursive: true, force: true })
  }
}
