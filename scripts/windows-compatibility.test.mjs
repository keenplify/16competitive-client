import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  isSupportedOperatingSystem,
  windowsCompatibilityMessages
} from '../src/shared/windows-compatibility.ts'

test('rejects Windows XP through 8.1 and unrecognized versions', () => {
  for (const version of [
    '5.1.2600',
    '6.0.6002',
    '6.1.7601',
    '6.2.9200',
    '6.3.9600',
    'unknown',
    ''
  ]) {
    assert.equal(isSupportedOperatingSystem('win32', version), false, version)
  }
})
test('allows Windows 10, Windows 11, and Linux', () => {
  for (const version of ['10.0.19045', '10.0.26100']) {
    assert.equal(isSupportedOperatingSystem('win32', version), true)
  }
  assert.equal(isSupportedOperatingSystem('linux', '6.17.0'), true)
})
test('provides all supported translations', () => {
  assert.deepEqual(Object.keys(windowsCompatibilityMessages).sort(), [
    'en',
    'hi',
    'id',
    'ja',
    'pt',
    'ru',
    'th',
    'tl'
  ])
})
