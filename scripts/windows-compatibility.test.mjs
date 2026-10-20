import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  formatWindowsCompatibilityError,
  isSupportedOperatingSystem,
  isSupportedWindowsInstallation,
  windowsCompatibilityMessages
} from '../src/shared/windows-compatibility.ts'
import { parseInstalledWindowsMajorVersion } from '../src/main/windows-version.ts'

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

test('startup error includes the exact detected OS and launcher versions in every language', () => {
  for (const language of Object.keys(windowsCompatibilityMessages)) {
    const message = formatWindowsCompatibilityError(language, '6.2.9200', '2026.1019.4')
    assert.ok(message.startsWith(`${windowsCompatibilityMessages[language]}\n\n`))
    const diagnostics = message.split('\n\n')[1].split('\n')
    assert.equal(diagnostics.length, 2)
    assert.ok(diagnostics[0].endsWith(': "6.2.9200"'))
    assert.ok(diagnostics[1].endsWith(': 2026.1019.4'))
  }
})

test('startup error preserves empty and unexpected detected version values', () => {
  for (const release of ['', 'unknown', '6.2\n9200']) {
    const message = formatWindowsCompatibilityError('en', release, '2026.1019.4')
    assert.ok(message.includes(`Detected OS version: ${JSON.stringify(release)}\n`))
    assert.ok(message.endsWith('Launcher version: 2026.1019.4'))
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

test('reads the installed Windows major version from registry output', () => {
  assert.equal(
    parseInstalledWindowsMajorVersion(
      'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\r\n' +
        '    CurrentMajorVersionNumber    REG_DWORD    0xa\r\n'
    ),
    10
  )
  assert.equal(parseInstalledWindowsMajorVersion('CurrentMajorVersionNumber REG_DWORD 0x6'), 6)
  assert.equal(parseInstalledWindowsMajorVersion('CurrentMajorVersionNumber REG_SZ 10'), null)
  assert.equal(
    parseInstalledWindowsMajorVersion('CurrentMajorVersionNumber REG_DWORD invalid'),
    null
  )
})

test('accepts a Windows 11 installation despite a compatibility-mode process version', () => {
  assert.equal(isSupportedWindowsInstallation('win32', '6.2.9200', 10), true)
  assert.equal(isSupportedWindowsInstallation('win32', '6.2.9200', 6), false)
  assert.equal(isSupportedWindowsInstallation('win32', '6.2.9200', null), false)
})

test('accepts supported releases and Linux without an installed version', () => {
  assert.equal(isSupportedWindowsInstallation('win32', '10.0.26300', null), true)
  assert.equal(isSupportedWindowsInstallation('linux', '6.2.9200', null), true)
})
