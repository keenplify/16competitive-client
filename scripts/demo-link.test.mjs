import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseDemoLink } from '../src/shared/demo-link.ts'
const id = 'abed714b-7416-4318-b4de-ebb21182cd68'
test('accepts only recording IDs in the demo action', () => {
  assert.equal(parseDemoLink(`competitive16://play-demo?recordingId=${id}`), id)
  for (const link of [
    `https://play-demo?recordingId=${id}`,
    `competitive16://other?recordingId=${id}`,
    `competitive16://play-demo?recordingId=${id}&recordingId=${id}`,
    `competitive16://play-demo?recordingId=${id}&url=https://evil.example`,
    `competitive16://user@play-demo?recordingId=${id}`,
    `competitive16://play-demo/file?recordingId=${id}`,
    'competitive16://play-demo?recordingId=../../autoexec.cfg',
    `competitive16://play-demo?recordingId=${id}#extra`
  ])
    assert.equal(parseDemoLink(link), null)
})
