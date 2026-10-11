/** BOT is the native GoldSrc scoreboard marker, shared across locales. */
export function scoreboardLatency(
  player: { bot: boolean; ping: number },
  showBotTags: boolean
): string | number {
  return showBotTags && player.bot ? scoreboardBotTranslations.en['scoreboard.botTag'] : player.ping
}
import { scoreboardBotTranslations } from '../src/renderer/src/features/i18n/scoreboard-bot-translations.ts'
