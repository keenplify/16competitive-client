/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { NativeReadinessRequests } from '../src/web/native-readiness-requests.ts'

function harness(connected = false) {
  let browserRequests = 0,
    stopped = 0,
    closed = 0
  const requests = []
  const track = { stop: () => stopped++ }
  class Stream {
    tracks = []
    addTrack(value) {
      this.tracks.push(value)
    }
    getTracks() {
      return this.tracks
    }
  }
  class Peer {
    iceGatheringState = 'complete'
    connectionState = 'connected'
    addTransceiver() {
      /* Receive-only audio in this fixture. */
    }
    async createOffer() {
      return { type: 'offer', sdp: 'local-offer' }
    }
    async setLocalDescription(value) {
      this.localDescription = value
    }
    async setRemoteDescription() {
      this.ontrack({ track })
    }
    close() {
      closed++
    }
  }
  class Bridge {
    isAuthorized() {
      return connected
    }
    async request(url, init) {
      const body = init.body ? JSON.parse(init.body) : null
      requests.push({ url, body })
      return {
        ok: true,
        json: async () =>
          url.endsWith('/offer')
            ? { type: 'answer', sdp: 'local-answer' }
            : body?.action === 'diagnostics'
              ? { ok: true, logs: '[qconsole.log] game logs' }
              : { ok: true, port: 49153, capability: 'b'.repeat(64) }
      }
    }
  }
  const source = ts.transpileModule(
    readFileSync(new URL('../src/web/local-play.ts', import.meta.url), 'utf8').replaceAll(
      'import.meta.env.DEV',
      'false'
    ) +
      '\nexport function connectTestBridge() { localChannel = {port:49152,token:"a".repeat(64),origin:"https://example.test"} }',
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
  ).outputText
  const exports = {}
  new Function(
    'require',
    'exports',
    'window',
    'navigator',
    'RTCPeerConnection',
    'MediaStream',
    source
  )(
    (name) =>
      name === './native-readiness-requests'
        ? { NativeReadinessRequests }
        : name === './local-bridge'
          ? { LocalBridge: Bridge }
          : name === './browser-session'
            ? {
                currentApiOrigin: () => 'https://regional.test',
                getWebSessionToken: () => 'account-token'
              }
            : {},
    exports,
    { location: { origin: 'https://example.test' } },
    {
      mediaDevices: {
        getUserMedia: async () => {
          browserRequests++
          const stream = new Stream()
          stream.addTrack(track)
          return stream
        }
      }
    },
    Peer,
    Stream
  )
  if (connected) exports.connectTestBridge()
  return { exports, requests, counts: () => ({ browserRequests, stopped, closed }) }
}

test('web voice without a helper retains browser microphone access', async () => {
  const h = harness()
  const capture = await h.exports.captureWebMicrophone()
  assert.equal(capture.stream.getTracks().length, 1)
  assert.equal(h.counts().browserRequests, 1)
  assert.equal(h.requests.length, 0)
  capture.close()
  assert.equal(h.counts().stopped, 1)
})

test('connected helper owns capture and closes local transport without browser microphone permission', async () => {
  const h = harness(true)
  const capture = await h.exports.captureWebMicrophone()
  assert.equal(capture.stream.getTracks().length, 1)
  assert.equal(h.counts().browserRequests, 0)
  assert.deepEqual(h.requests[0].body, { action: 'microphone', apiOrigin: 'https://example.test' })
  assert.equal(h.requests[1].url, 'http://127.0.0.1:49153/offer')
  capture.close()
  assert.deepEqual(h.counts(), { browserRequests: 0, stopped: 1, closed: 1 })
})

test('helper diagnostics request uses the authenticated regional session and selected match', async () => {
  const h = harness(true)
  const matchId = '12345678-1234-4234-8234-123456789abc'
  assert.match(await h.exports.nativeDiagnosticLogs(matchId), /qconsole/)
  assert.deepEqual(h.requests[0].body, {
    action: 'diagnostics',
    apiOrigin: 'https://regional.test',
    token: 'account-token',
    matchId
  })
})
