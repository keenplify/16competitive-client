import type { LanguageCode } from './i18n'

type RuntimeLanguage = Exclude<LanguageCode, 'en'>

const ru: Record<string, string> = {
  'Players Ready': 'игроков готовы',
  Updated: 'Обновлено',
  'Next refresh': 'Следующее обновление',
  'Playing since': 'Играет с',
  'won ·': 'победила ·',
  'Party ·': 'Группа ·',
  'Friends ·': 'Друзья ·',
  'Server ready at': 'Сервер готов:',
  '. The launcher will launch Counter-Strike and connect automatically.': '. Лаунчер запустит Counter-Strike и подключится автоматически.',
  'The game server is available at': 'Игровой сервер доступен:',
  selected: 'выбрано',
  pts: 'очк.',
  'By': 'Автор:',
  'No': 'Нет',
  'skins are currently on sale.': 'скинов сейчас в продаже.',
  'Showing:': 'Показано:',
  EQUIP: 'ЭКИПИРОВАТЬ',
  '· You': '· Вы',
  '[Party]': '[Группа]',
  '[Global]': '[Общий]',
  'Hold': 'Удерживайте',
  'for Team': 'для команды',
  'for Party': 'для группы',
  'talk while the launcher is focused.': 'для разговора, пока окно лаунчера активно.',
  'in Counter-Strike.': 'в Counter-Strike.',
  'Open mic ': 'Открытый микрофон ',
  on: 'вкл.',
  off: 'выкл.',
  new: 'новое',
  connecting: 'подключение',
  connected: 'подключено',
  failed: 'ошибка',
  closed: 'закрыто',
  Field: 'Полевой',
  Forge: 'Ковка',
  Strike: 'Удар',
  Vanguard: 'Авангард',
  Neon: 'Неон',
  Crimson: 'Багровый',
  Relic: 'Реликвия',
  Vault: 'Хранилище',
  'Friend request sent.': 'Запрос в друзья отправлен.',
  'Friend request accepted.': 'Запрос в друзья принят.',
  'Friends request failed.': 'Не удалось выполнить действие с друзьями.',
  'Party request failed.': 'Не удалось выполнить действие с группой.',
  'Enter a username with 3–32 letters, numbers, or underscores.': 'Введите имя из 3–32 букв, цифр или подчеркиваний.',
  'That friend has an invalid username.': 'У этого друга некорректное имя.',
  'Party invitation accepted.': 'Приглашение в группу принято.',
  'Party invitation declined.': 'Приглашение в группу отклонено.',
  'Party disbanded.': 'Группа распущена.',
  'You left the party.': 'Вы покинули группу.',
  'Match found. Waiting for players to accept.': 'Матч найден. Ждем подтверждения игроков.',
  'Starting the game server…': 'Запускаем игровой сервер…',
  'Matchmaking request failed.': 'Ошибка запроса матчмейкинга.'
}

const tl: Record<string, string> = {
  'Players Ready': 'Players Ready',
  Updated: 'Updated',
  'Next refresh': 'Next refresh',
  'Playing since': 'Playing since',
  'won ·': 'won ·',
  'Party ·': 'Party ·',
  'Friends ·': 'Friends ·',
  'Server ready at': 'Ready ang server sa',
  '. The launcher will launch Counter-Strike and connect automatically.': '. Auto ila-launch ng launcher ang Counter-Strike at magko-connect.',
  'The game server is available at': 'Available ang game server sa',
  selected: 'selected',
  pts: 'pts',
  'By': 'By',
  'No': 'Walang',
  'skins are currently on sale.': 'skins on sale ngayon.',
  'Showing:': 'Showing:',
  EQUIP: 'EQUIP',
  '· You': '· You',
  '[Party]': '[Party]',
  '[Global]': '[Global]',
  'Hold': 'Hold',
  'for Team': 'for Team',
  'for Party': 'for Party',
  'talk while the launcher is focused.': 'talk habang focused ang launcher.',
  'in Counter-Strike.': 'sa Counter-Strike.',
  'Open mic ': 'Open mic ',
  on: 'on',
  off: 'off',
  new: 'new',
  connecting: 'connecting',
  connected: 'connected',
  failed: 'failed',
  closed: 'closed',
  Field: 'Field',
  Forge: 'Forge',
  Strike: 'Strike',
  Vanguard: 'Vanguard',
  Neon: 'Neon',
  Crimson: 'Crimson',
  Relic: 'Relic',
  Vault: 'Vault',
  'Friend request sent.': 'Sent na ang friend request.',
  'Friend request accepted.': 'Accepted na ang friend request.',
  'Friends request failed.': 'Nag-fail ang friend request.',
  'Party request failed.': 'Nag-fail ang party request.',
  'Enter a username with 3–32 letters, numbers, or underscores.': 'Mag-enter ng username na 3–32 letters, numbers, o underscores.',
  'That friend has an invalid username.': 'Invalid ang username ng friend na iyon.',
  'Party invitation accepted.': 'Accepted na ang party invite.',
  'Party invitation declined.': 'Declined ang party invite.',
  'Party disbanded.': 'Disbanded na ang party.',
  'You left the party.': 'Umalis ka sa party.',
  'Match found. Waiting for players to accept.': 'Match found. Waiting sa players na mag-accept.',
  'Starting the game server…': 'Starting ang game server…',
  'Matchmaking request failed.': 'Nag-fail ang matchmaking request.'
}

const catalogs: Record<RuntimeLanguage, Record<string, string>> = { ru, tl }

const patterns = {
  ru: [
    [/^Invitation sent to (.+)\.$/, 'Приглашение отправлено $1.'],
    [/^Party invitation sent to (.+)\.$/, 'Приглашение в группу отправлено $1.'],
    [/^Match found on (.+) for (.+)\.$/, 'Матч найден: $1, режим $2.'],
    [/^Players: (.+)\.$/, 'Игроки: $1.'],
    [/^(\d+) \/ (\d+) players ready\.$/, '$1 / $2 игроков готовы.'],
    [/^Game server starts in (\d+) second(?:s)?\.$/, 'Игровой сервер запустится через $1 сек.'],
    [/^Game server ready at (.+)\.$/, 'Игровой сервер готов: $1.'],
    [/^(\d+)\/(\d+) connected · Open mic$/, 'Подключено $1/$2 · открытый микрофон'],
    [/^(\d+)\/(\d+) connected · Talking to: (Team|Party)$/, 'Подключено $1/$2 · голос: $3']
  ],
  tl: [
    [/^Invitation sent to (.+)\.$/, 'Sent na ang invite kay $1.'],
    [/^Party invitation sent to (.+)\.$/, 'Sent na ang party invite kay $1.'],
    [/^Match found on (.+) for (.+)\.$/, 'Match found sa $1 for $2.'],
    [/^Players: (.+)\.$/, 'Players: $1.'],
    [/^(\d+) \/ (\d+) players ready\.$/, '$1 / $2 players ready.'],
    [/^Game server starts in (\d+) second(?:s)?\.$/, 'Game server starts in $1 second(s).'],
    [/^Game server ready at (.+)\.$/, 'Ready ang game server sa $1.'],
    [/^(\d+)\/(\d+) connected · Open mic$/, '$1/$2 connected · Open mic'],
    [/^(\d+)\/(\d+) connected · Talking to: (Team|Party)$/, '$1/$2 connected · Talking to: $3']
  ]
} as const

export const translateRuntimeFragment = (language: LanguageCode, source: string): string => {
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
