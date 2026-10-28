import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

test('web app permits its authenticated loopback helper settings bridge', () => {
  const html = readFileSync(new URL('../src/web/index.html', import.meta.url), 'utf8')
  const policy = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)?.[1]
  assert.ok(policy, 'web app CSP is present')
  const connect = policy.split(';').find((directive) => directive.trim().startsWith('connect-src '))
  assert.ok(connect, 'connect-src is present')
  assert.match(connect, /(?:^|\s)http:\/\/127\.0\.0\.1:\*(?:\s|$)/)
})
