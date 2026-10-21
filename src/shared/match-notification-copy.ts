import type { MatchmakingMode } from './matchmaking'

const copy = {
  en: {
    open: 'Open app',
    quit: 'Quit',
    queueing: 'Queueing',
    title: 'Match found',
    body: 'Return to 1.6 Competitive and accept before the timer ends.'
  },
  ru: {
    open: 'Открыть приложение',
    quit: 'Выйти',
    queueing: 'Поиск матча',
    title: 'Матч найден',
    body: 'Вернитесь в 1.6 Competitive и подтвердите готовность до окончания таймера.'
  },
  tl: {
    open: 'Buksan ang app',
    quit: 'Quit',
    queueing: 'Nakapila',
    title: 'May nahanap na match',
    body: 'Bumalik sa 1.6 Competitive at tanggapin bago matapos ang oras.'
  },
  th: {
    open: 'เปิดแอป',
    quit: 'ออก',
    queueing: 'กำลังค้นหาแมตช์',
    title: 'พบแมตช์แล้ว',
    body: 'กลับไปที่ 1.6 Competitive และยืนยันก่อนหมดเวลา'
  },
  id: {
    open: 'Buka aplikasi',
    quit: 'Keluar',
    queueing: 'Dalam antrean',
    title: 'Pertandingan ditemukan',
    body: 'Kembali ke 1.6 Competitive dan terima sebelum waktu habis.'
  },
  hi: {
    open: 'ऐप खोलें',
    quit: 'बंद करें',
    queueing: 'कतार में',
    title: 'मैच मिल गया',
    body: '1.6 Competitive पर लौटें और समय खत्म होने से पहले स्वीकार करें।'
  },
  pt: {
    open: 'Abrir aplicativo',
    quit: 'Sair',
    queueing: 'Na fila',
    title: 'Partida encontrada',
    body: 'Volte ao 1.6 Competitive e aceite antes de o tempo acabar.'
  },
  ja: {
    open: 'アプリを開く',
    quit: '終了',
    queueing: 'マッチ検索中',
    title: 'マッチが見つかりました',
    body: '1.6 Competitive に戻り、制限時間内に承認してください。'
  }
} as const

export function matchNotificationCopy(language: string) {
  const code = language.toLowerCase().split('-')[0]
  return copy[code as keyof typeof copy] ?? copy.en
}

const queueModeLabels = {
  en: {
    '5v5': 'Competitive 5v5',
    '3v3': '3v3',
    unrated: 'Unrated 5v5',
    legacy: 'Legacy 5v5',
    legacy_3v3: 'Legacy 3v3',
    cs13_3v3: 'CS 1.3 · 3v3',
    casual: 'Casual',
    ffa: 'FFA',
    arena: 'Arena'
  },
  ru: {
    '5v5': 'Рейтинговый 5v5',
    '3v3': '3v3',
    unrated: 'Без рейтинга 5v5',
    legacy: 'Классический 5v5',
    legacy_3v3: 'Классический 3v3',
    cs13_3v3: 'CS 1.3 · 3v3',
    casual: 'Обычный',
    ffa: 'FFA',
    arena: 'Арена'
  },
  tl: {
    '5v5': 'Competitive 5v5',
    '3v3': '3v3',
    unrated: 'Unrated 5v5',
    legacy: 'Legacy 5v5',
    legacy_3v3: 'Legacy 3v3',
    cs13_3v3: 'CS 1.3 · 3v3',
    casual: 'Casual',
    ffa: 'FFA',
    arena: 'Arena'
  },
  th: {
    '5v5': 'จัดอันดับ 5v5',
    '3v3': '3v3',
    unrated: 'ไม่จัดอันดับ 5v5',
    legacy: 'คลาสสิก 5v5',
    legacy_3v3: 'คลาสสิก 3v3',
    cs13_3v3: 'CS 1.3 · 3v3',
    casual: 'ทั่วไป',
    ffa: 'FFA',
    arena: 'อารีนา'
  },
  id: {
    '5v5': 'Kompetitif 5v5',
    '3v3': '3v3',
    unrated: 'Tanpa peringkat 5v5',
    legacy: 'Klasik 5v5',
    legacy_3v3: 'Klasik 3v3',
    cs13_3v3: 'CS 1.3 · 3v3',
    casual: 'Kasual',
    ffa: 'FFA',
    arena: 'Arena'
  },
  hi: {
    '5v5': 'प्रतिस्पर्धी 5v5',
    '3v3': '3v3',
    unrated: 'बिना रैंक 5v5',
    legacy: 'क्लासिक 5v5',
    legacy_3v3: 'क्लासिक 3v3',
    cs13_3v3: 'CS 1.3 · 3v3',
    casual: 'कैज़ुअल',
    ffa: 'FFA',
    arena: 'अरीना'
  },
  pt: {
    '5v5': 'Competitivo 5v5',
    '3v3': '3v3',
    unrated: 'Sem classificação 5v5',
    legacy: 'Clássico 5v5',
    legacy_3v3: 'Clássico 3v3',
    cs13_3v3: 'CS 1.3 · 3v3',
    casual: 'Casual',
    ffa: 'FFA',
    arena: 'Arena'
  },
  ja: {
    '5v5': 'ランク戦 5v5',
    '3v3': '3v3',
    unrated: '非ランク戦 5v5',
    legacy: 'クラシック 5v5',
    legacy_3v3: 'クラシック 3v3',
    cs13_3v3: 'CS 1.3 · 3v3',
    casual: 'カジュアル',
    ffa: 'FFA',
    arena: 'アリーナ'
  }
} as const satisfies Record<keyof typeof copy, Record<MatchmakingMode, string>>

export function queuedModeLabel(language: string, mode: MatchmakingMode): string {
  const code = language.toLowerCase().split('-')[0]
  return (queueModeLabels[code as keyof typeof queueModeLabels] ?? queueModeLabels.en)[mode]
}
