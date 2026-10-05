const NEXTCLIENT_SITE = 'https://nextclient.ru/'
const NEXTCLIENT_DOWNLOAD_HOST = 'dl.skachat-cs.su'

/** Only accept the ZIP linked by the official site's download button. */
export function nextClientArchiveUrl(html: string): string {
  for (const anchor of html.matchAll(/<a\b[^>]*>/gi)) {
    if (!/\bdownload(?:\s|=|>)/i.test(anchor[0])) continue
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(anchor[0])?.[1]
    if (!href) continue
    const url = new URL(href, NEXTCLIENT_SITE)
    if (
      url.protocol === 'https:' &&
      url.hostname === NEXTCLIENT_DOWNLOAD_HOST &&
      /^\/nc\/[0-9.]+\/CS1\.6_NextClient\.zip$/i.test(url.pathname)
    ) {
      return url.href
    }
  }
  throw new Error('NextClient download changed. Visit nextclient.ru or choose an installed folder.')
}

export function nextClientInstallerName(entryName: string): string {
  if (!/^CS_1\.6_NextClient_[0-9]+(?:\.[0-9]+)*\.exe$/i.test(entryName)) {
    throw new Error('The NextClient download does not contain the expected installer.')
  }
  return entryName
}

export function nextClientRegistryKeys(output: string): string[] {
  const keys: string[] = []
  let currentKey: string | null = null
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (/^HKEY_(?:CURRENT_USER|LOCAL_MACHINE)\\/i.test(trimmed)) {
      currentKey = trimmed
    } else if (currentKey && /^DisplayName\s+REG_\w+\s+.*\bNextClient\b/i.test(trimmed)) {
      keys.push(currentKey)
    }
  }
  return [...new Set(keys)]
}

export function nextClientRegistryValue(output: string, name: string): string | null {
  for (const line of output.split(/\r?\n/)) {
    const match = /^\s*([^\s]+)\s+REG_\w+\s+(.+)$/i.exec(line)
    if (match?.[1].toLowerCase() === name.toLowerCase()) return match[2].trim()
  }
  return null
}
