/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseEnv } from 'node:util'

export const buildEnvironmentNames = [
  'API_BASE_URL',
  'MATCHMAKING_WS_URL',
  'DISCORD_CLIENT_ID',
  'DISCORD_LARGE_IMAGE_KEY'
]
export async function releaseEnvironment(root, exported = process.env) {
  let values = {}
  for (const name of ['.env', '.env.production', '.env.production.local', '.env.release.local']) {
    try {
      values = { ...values, ...parseEnv(await readFile(join(root, name), 'utf8')) }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }
  const selected = {
    API_BASE_URL: 'https://16competitive.papamo.dev',
    MATCHMAKING_WS_URL: 'wss://16competitive.papamo.dev/matchmaking/ws'
  }
  for (const name of buildEnvironmentNames) {
    const value = exported[name] ?? values[name]
    if (value?.trim()) selected[name] = value.trim()
  }
  for (const [name, protocol] of [
    ['API_BASE_URL', 'https:'],
    ['MATCHMAKING_WS_URL', 'wss:']
  ]) {
    const url = new URL(selected[name])
    if (
      url.protocol !== protocol ||
      url.username ||
      url.password ||
      /^(?:localhost|.*\.localhost|127\..*|0\.0\.0\.0|\[::1\])$/i.test(url.hostname)
    )
      throw new Error(
        `${name} must use a production ${protocol} endpoint. Set it in .env.release.local or your shell before release:local.`
      )
  }
  if (selected.DISCORD_CLIENT_ID && !/^\d{17,20}$/.test(selected.DISCORD_CLIENT_ID))
    throw new Error('DISCORD_CLIENT_ID must be a Discord application ID')
  return selected
}
