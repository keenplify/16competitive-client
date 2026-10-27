/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import net from 'node:net'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// A read-only smoke check for an extracted, production support archive. It
// checks the real signed native bundle/API without starting a game or saving a login.
const executable = resolve(process.argv[2])
const apiOrigin = process.argv[3] || 'https://16competitive.papamo.dev'
const root = await mkdtemp(join(tmpdir(), '16c-packaged-smoke-'))
const capability = randomBytes(32).toString('hex')
const server = net.createServer()
let socket,
  child,
  output = '',
  errors = ''
try {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  server.on('connection', (peer) => {
    socket = peer
    peer.on('error', () => {
      /* A rejected control connection closes immediately. */
    })
    let greeting = ''
    const hello = (chunk) => {
      greeting += chunk.toString()
      if (!greeting.includes('\n')) return
      assert.equal(JSON.parse(greeting.trim()).capability, capability)
      peer.removeListener('data', hello)
      peer.on('data', (b) => {
        output += b.toString()
        assert.ok(output.length < 16384)
      })
      peer.write(
        JSON.stringify({ protocol: 1, action: 'check', apiOrigin, token: null, matchId: null }) +
          '\n'
      )
    }
    peer.on('data', hello)
  })
  child = spawn(
    executable,
    [
      ...(process.platform === 'linux' ? ['--disable-setuid-sandbox'] : []),
      '--native-helper-runtime',
      root,
      String(server.address().port),
      capability
    ],
    {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined, NODE_OPTIONS: undefined }
    }
  )
  child.stderr.on('data', (b) => {
    if (errors.length < 4096) errors += b.toString()
  })
  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('Packaged runtime smoke check timed out'))
    }, 90000)
    child.once('error', reject)
    child.once('exit', (code) => {
      clearTimeout(timer)
      resolve(code)
    })
  })
  assert.equal(code, 0, output || errors)
  const reply = JSON.parse(output.trim())
  assert.equal(reply.ok, true)
  assert.equal(reply.protocol, 1)
  assert.equal(typeof reply.device.banned, 'boolean')
  console.log(
    `Packaged runtime control channel and signed native device check passed on ${process.platform}.`
  )
} finally {
  if (child && child.exitCode === null) child.kill()
  socket?.destroy()
  await new Promise((resolve) => server.close(resolve))
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
}
