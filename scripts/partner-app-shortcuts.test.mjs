import assert from 'node:assert/strict'
import test from 'node:test'
import { desktopExecArgument, partnerDesktopEntry } from '../src/shared/partner-app-shortcuts.ts'
test('Linux desktop entries quote paths, escape field codes and cannot introduce another command', () => {
  const executable = '/home/player/My App/launch "$`%file.AppImage'
  const quoted = desktopExecArgument(executable)
  assert.ok(quoted.startsWith('"') && quoted.endsWith('"'))
  assert.ok(quoted.includes('%%file'))
  assert.ok(quoted.includes('\\$'))
  const entry = partnerDesktopEntry('My Community', executable, '/home/player/icon.png')
  assert.equal(entry.split('\n').filter((line) => line.startsWith('Exec=')).length, 1)
  assert.ok(entry.includes('Name=My Community'))
  assert.ok(entry.includes('X-16Competitive-Managed=true'))
  assert.throws(() => desktopExecArgument('/tmp/app\nExec=bad'))
  assert.throws(() => partnerDesktopEntry('bad\nName=another', '/app', '/icon'))
})
