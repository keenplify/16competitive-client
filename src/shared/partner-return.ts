// Only approved partner integrations can receive logout redirects.
const destinations: Readonly<Record<string, string>> = {
  '583704ab-6fc5-4b58-8fc2-d91cf1d7c051': 'https://www.olaguergeyming.com/gamehub/'
}
export const approvedPartnerReturnUrl = (partnerId: string): string | null =>
  destinations[partnerId] ?? null
