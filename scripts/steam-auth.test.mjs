import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateSteamAuthorizationUrl } from '../src/shared/auth.ts'

test('Steam handoff allows only the Steam HTTPS OpenID endpoint', () => {
  const url = 'https://steamcommunity.com/openid/login?openid.mode=checkid_setup'
  assert.equal(validateSteamAuthorizationUrl(url), url)
  for (const input of [
    'http://steamcommunity.com/openid/login',
    'https://steamcommunity.com.evil.test/openid/login',
    'https://steamcommunity.com@evil.test/openid/login',
    'https://name:secret@steamcommunity.com/openid/login',
    'https://steamcommunity.com/openid/login/other',
    'https://steamcommunity.com:4433/openid/login',
    'file:///tmp/login',
    'javascript:alert(1)',
    'https://steamcommunity.com/openid/login#unexpected',
    'not a URL'
  ])
    assert.throws(() => validateSteamAuthorizationUrl(input), input)
})
