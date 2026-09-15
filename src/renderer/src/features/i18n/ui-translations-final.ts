import type { LanguageCode } from './i18n'

type RuntimeLanguage = Exclude<LanguageCode, 'en'>

const ru: Record<string, string> = {
  'Party model scene': 'Сцена моделей группы',
  'Authentication failed. Please try again.': 'Ошибка авторизации. Попробуйте еще раз.',
  'Username must be 3–32 characters using letters, numbers, or underscores.': 'Имя должно содержать 3–32 символа: буквы, цифры или подчеркивания.',
  'Password must be 8–128 characters.': 'Пароль должен содержать 8–128 символов.',
  'Enter a valid email address.': 'Введите корректный email.',
  'Sign in, then go to Settings > Credentials > Connected accounts > Facebook.': 'Войдите, затем откройте Настройки > Учетная запись > Подключенные аккаунты > Facebook.',
  'Background music volume': 'Громкость фоновой музыки',
  'Sound effects volume': 'Громкость звуковых эффектов',
  volume: 'громкость',
  'Request failed.': 'Запрос не выполнен.',
  'Counter-Strike path saved.': 'Путь к Counter-Strike сохранен.',
  'Could not load daily quests.': 'Не удалось загрузить ежедневные задания.',
  'Could not refresh daily quests.': 'Не удалось обновить ежедневные задания.',
  'MMR': 'MMR',
  'HS% / ADR': 'HS% / ADR',
  'K / A / D': 'K / A / D',
  'P Cash': 'P Cash',
  'Counter-Strike 1.6': 'Counter-Strike 1.6',
  Google: 'Google',
  Facebook: 'Facebook'
}

const tl: Record<string, string> = {
  'Party model scene': 'Party model scene',
  'Authentication failed. Please try again.': 'Nag-fail ang authentication. Try ulit.',
  'Username must be 3–32 characters using letters, numbers, or underscores.': 'Dapat 3–32 characters ang username gamit letters, numbers, o underscores.',
  'Password must be 8–128 characters.': 'Dapat 8–128 characters ang password.',
  'Enter a valid email address.': 'Mag-enter ng valid email address.',
  'Sign in, then go to Settings > Credentials > Connected accounts > Facebook.': 'Mag-sign in, then punta sa Settings > Account > Connected accounts > Facebook.',
  'Background music volume': 'Background music volume',
  'Sound effects volume': 'Sound effects volume',
  volume: 'volume',
  'Request failed.': 'Nag-fail ang request.',
  'Counter-Strike path saved.': 'Saved na ang Counter-Strike path.',
  'Could not load daily quests.': 'Hindi ma-load ang daily quests.',
  'Could not refresh daily quests.': 'Hindi ma-refresh ang daily quests.',
  'MMR': 'MMR',
  'HS% / ADR': 'HS% / ADR',
  'K / A / D': 'K / A / D',
  'P Cash': 'P Cash',
  'Counter-Strike 1.6': 'Counter-Strike 1.6',
  Google: 'Google',
  Facebook: 'Facebook'
}

const catalogs: Record<RuntimeLanguage, Record<string, string>> = { ru, tl }

const patterns = {
  ru: [
    [/^(.+) volume$/, 'Громкость: $1'],
    [/^Open (.+) controls$/, 'Открыть управление: $1'],
    [/^(.+): disconnected$/, '$1: отключено']
  ],
  tl: [
    [/^(.+) volume$/, '$1 volume'],
    [/^Open (.+) controls$/, 'Open $1 controls'],
    [/^(.+): disconnected$/, '$1: disconnected']
  ]
} as const

export const translateRuntimeFinal = (language: LanguageCode, source: string): string => {
  if (language === 'en' || !source) return source
  const match = source.match(/^(\s*)([\s\S]*?)(\s*)$/)
  if (!match) return source
  const [, leading, body, trailing] = match
  if (!body) return source
  const exact = catalogs[language][body]
  if (exact !== undefined) return `${leading}${exact}${trailing}`
  for (const [pattern, replacement] of patterns[language]) {
    if (pattern.test(body)) return `${leading}${body.replace(pattern, replacement)}${trailing}`
  }
  return source
}
