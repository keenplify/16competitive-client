import assert from 'node:assert/strict'
import { test } from 'node:test'
import { safeSourcePath, powershellCommand } from './dev-vm.mjs'

test('VM snapshots exclude game config, secrets, environment, and escaping paths', () => {
  for (const path of [
    'config.cfg',
    'cstrike/CONFIG.CFG',
    'fixtures/config.cfg/data',
    '.env',
    '.env.development',
    'src/.env.local',
    '../outside',
    '/etc/passwd',
    'C:/file',
    'file:stream',
    'a\\b',
    '.git/objects/data',
    'signing-private-key.pem',
    'file.pfx',
    'key.key'
  ]) {
    assert.equal(safeSourcePath(path), false, path)
  }
  for (const path of [
    'package.json',
    'src/main/index.ts',
    'source file.ts',
    'helper-release.json'
  ]) {
    assert.equal(safeSourcePath(path), true, path)
  }
})

test('PowerShell payload travels encoded, preserving metacharacters as code', () => {
  const source = 'Write-Output "value with spaces"; $value = "literal"'
  const args = powershellCommand(source)
  assert.equal(args.at(-2), '-EncodedCommand')
  assert.equal(
    Buffer.from(args.at(-1), 'base64').toString('utf16le'),
    "$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';" + source
  )
})
