import { translate, useLanguageStore } from '../i18n/i18n'

/** Also used for HTTP custom-room errors, which carry the same backend message. */
export function friendlyFireMessage(message: string): string {
  const language = useLanguageStore.getState().language
  if (message === 'Stop damaging teammates. Further team damage can remove you from the match.') {
    return translate(language, 'matchmaking.friendlyFireWarning')
  }
  if (message === 'Removed from this match for friendly fire.') {
    return translate(language, 'matchmaking.friendlyFireKicked')
  }
  const match = /^Friendly-fire suspension until (\d{4}-\d{2}-\d{2}T[\d:.]+Z)$/.exec(message)
  if (match && Number.isFinite(Date.parse(match[1]))) {
    return translate(language, 'matchmaking.friendlyFireSuspended', {
      until: new Date(match[1]).toLocaleString(language === 'tl' ? 'fil-PH' : language)
    })
  }
  return message
}
