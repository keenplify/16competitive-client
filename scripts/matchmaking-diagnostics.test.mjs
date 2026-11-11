import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  MatchmakingDiagnostics,
  projectMatchDiagnostics
} from '../src/shared/matchmaking-diagnostics.ts'

test('diagnostics distinguish received ready checks from events forwarded to the UI', () => {
  let now = 1000
  const trace = new MatchmakingDiagnostics(() => now)
  trace.setOwner('player')
  trace.setSnapshot(() => ({ authenticated: false, socketState: 0, readyDeadline: null }))
  trace.record('socket_received', { type: 'match_found', matchId: 'match' })
  trace.record('renderer_forward', { type: 'match_found', matchId: 'match' })
  now += 100
  trace.record('socket_received', {
    type: 'match_ready_check',
    matchId: 'match',
    deadline: '2026-11-04T01:00:00Z',
    acceptedPlayerIds: ['private-player-id']
  })
  trace.record('send_rejected_disconnected', {
    type: 'match_ready_response',
    matchId: 'match',
    accepted: true
  })
  for (let i = 0; i < 1000; i++)
    trace.record('renderer_forward', {
      type: 'match_assets_progress',
      completedFiles: i,
      totalFiles: 1000
    })
  const report = JSON.parse(trace.report())
  assert.equal(report.timeline.length, 4)
  assert.equal(report.snapshot.authenticated, false)
  assert.equal(report.snapshot.readyDeadline, null)
  assert.equal(report.timeline[2].data.acceptedCount, 1)
  assert.equal(report.assetProgress.data.completedFiles, 999)
  assert.ok(!trace.report().includes('private-player-id'))
})

test('raw connection, chat, credentials and URL queries never enter structured diagnostics', () => {
  const projected = projectMatchDiagnostics({
    type: 'match_connect',
    matchId: 'match',
    password: 'secret-password',
    joinToken: 'secret-token',
    message: 'private-chat',
    player: { email: 'private-email' },
    hostApiUrl: 'https://username:secret@example.com/path?token=secret#secret',
    websocketUrl: 'wss://example.com/matchmaking/ws?authorization=secret',
    acceptedPlayerIds: ['private-id'],
    totalFiles: Infinity
  })
  assert.deepEqual(projected, {
    type: 'match_connect',
    matchId: 'match',
    hostApiUrl: 'https://example.com',
    websocketUrl: 'wss://example.com',
    acceptedCount: 1
  })
})

test('history is bounded, expires, and is cleared when the reporting account changes', () => {
  let now = 1000
  const trace = new MatchmakingDiagnostics(() => now)
  trace.setOwner('first')
  for (let i = 0; i < 1000; i++)
    trace.record('socket_received', { type: 'match_found', matchId: `match-${i}` })
  assert.equal(JSON.parse(trace.report()).timeline.length, 64)
  now += 30 * 60_000 + 1
  assert.deepEqual(JSON.parse(trace.report()).timeline, [])
  trace.record('socket_received', { type: 'match_found', matchId: 'old-account' })
  trace.setSnapshot(() => {
    trace.setOwner('second')
    return { readyDeadline: null }
  })
  assert.ok(!trace.report().includes('old-account'))
})

test('cleanup failures survive report projection while arbitrary cleanup details are rejected', () => {
  const cleanupCodes =
    'NATIVE_CLEANUP_FAILED AUTH_CLEANUP_FAILED STARTUP_CLEANUP_FAILED STARTUP_CLEANUP_FAILED NATIVE_CLEANUP_FAILED INSPECTOR_STOP_FAILED'
  assert.deepEqual(projectMatchDiagnostics({ code: 'NATIVE_INSTALL_FAILED', cleanupCodes }), {
    code: 'NATIVE_INSTALL_FAILED',
    cleanupCodes
  })
  for (const cleanupCodes of [
    'private file',
    'C:/private/session',
    'INSPECTOR_STOP_FAILED secret',
    Array(7).fill('NATIVE_CLEANUP_FAILED').join(' ')
  ]) {
    assert.deepEqual(projectMatchDiagnostics({ cleanupCodes }), {})
  }
})
