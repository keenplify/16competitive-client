export const isPartnerId = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value)
export const partnerIdFromDownloadName = (name: string): string | null => {
  const match = name.match(/--partner-([a-f0-9-]{36})(?: ?\(\d+\))?(?:\.(?:exe|AppImage))?$/i)
  return match && isPartnerId(match[1]) ? match[1].toLowerCase() : null
}
