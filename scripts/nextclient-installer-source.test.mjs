import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  nextClientArchiveUrl,
  nextClientInstallerName,
  nextClientRegistryKeys,
  nextClientRegistryValue
} from '../src/main/game/nextclient-installer-source.ts'

test('uses the official website download button and rejects another host', () => {
  const html =
    '<a href="https://dl.skachat-cs.su/nc/2.3.1/CS1.6_NextClient.zip" download><button>Download</button></a>'
  assert.equal(nextClientArchiveUrl(html), 'https://dl.skachat-cs.su/nc/2.3.1/CS1.6_NextClient.zip')
  assert.throws(() =>
    nextClientArchiveUrl('<a href="https://example.com/installer.zip" download>Download</a>')
  )
})

test('accepts one versioned installer name without a path', () => {
  assert.equal(
    nextClientInstallerName('CS_1.6_NextClient_2.5.3.exe'),
    'CS_1.6_NextClient_2.5.3.exe'
  )
  assert.throws(() => nextClientInstallerName('../CS_1.6_NextClient_2.5.3.exe'))
  assert.throws(() => nextClientInstallerName('config.cfg'))
})

test('finds the install record and custom installation location', () => {
  const key =
    'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\NextClient_is1'
  const output = `${key}\r\n    DisplayName    REG_SZ    CS 1.6 NextClient\r\n`
  assert.deepEqual(nextClientRegistryKeys(output), [key])
  assert.equal(
    nextClientRegistryValue(
      '    InstallLocation    REG_SZ    D:\\Games\\Counter-Strike NextClient\r\n',
      'InstallLocation'
    ),
    'D:\\Games\\Counter-Strike NextClient'
  )
})
