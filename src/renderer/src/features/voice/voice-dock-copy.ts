import { useTranslation, type SupportedLanguageCode } from '../i18n/i18n'

type Key =
  | 'partyVoice'
  | 'teamVoice'
  | 'serverVoice'
  | 'connected'
  | 'disconnected'
  | 'members'
  | 'micReady'
  | 'micIdle'
  | 'talking'
  | 'openMic'
  | 'on'
  | 'off'
  | 'details'
  | 'closeDetails'
  | 'viewProfile'
  | 'addFriend'
  | 'mute'
  | 'unmute'
  | 'volume'
  | 'friendRequestFailed'
type MoreKey =
  | 'pttTest'
  | 'holdToTalk'
  | 'holdPartyTalk'
  | 'disconnectVoice'
  | 'retryVoice'
  | 'reconnectVoice'
  | 'waitingForPeer'
  | 'micPermissionHint'
  | 'micPermissionPttHint'
  | 'bindHint'
  | 'partyPttHint'
  | 'partnerOpenMicHint'
  | 'peerConnected'
  | 'peerConnecting'
  | 'peerDisconnected'

const copy: Record<SupportedLanguageCode, Record<Key, string>> = {
  en: {
    partyVoice: 'Party voice',
    teamVoice: 'Team voice',
    serverVoice: 'Server voice',
    connected: 'Connected',
    disconnected: 'Disconnected',
    members: '{{count}} in voice',
    micReady: 'Mic ready',
    micIdle: 'Mic idle',
    talking: 'Talking',
    openMic: 'Open mic',
    on: 'On',
    off: 'Off',
    details: 'Show voice controls',
    closeDetails: 'Hide voice controls',
    viewProfile: 'View profile',
    addFriend: 'Add friend',
    mute: 'Mute',
    unmute: 'Unmute',
    volume: 'Volume',
    friendRequestFailed: 'Could not send friend request.'
  },
  ru: {
    partyVoice: 'Голос группы',
    teamVoice: 'Голос команды',
    serverVoice: 'Голос сервера',
    connected: 'Подключено',
    disconnected: 'Отключено',
    members: 'В голосе: {{count}}',
    micReady: 'Микрофон готов',
    micIdle: 'Микрофон неактивен',
    talking: 'Говорит',
    openMic: 'Открытый микрофон',
    on: 'Вкл.',
    off: 'Выкл.',
    details: 'Показать настройки голоса',
    closeDetails: 'Скрыть настройки голоса',
    viewProfile: 'Посмотреть профиль',
    addFriend: 'Добавить в друзья',
    mute: 'Заглушить',
    unmute: 'Включить звук',
    volume: 'Громкость',
    friendRequestFailed: 'Не удалось отправить заявку в друзья.'
  },
  tl: {
    partyVoice: 'Party voice',
    teamVoice: 'Team voice',
    serverVoice: 'Server voice',
    connected: 'Connected',
    disconnected: 'Disconnected',
    members: '{{count}} sa voice',
    micReady: 'Handa ang mic',
    micIdle: 'Idle ang mic',
    talking: 'Nagsasalita',
    openMic: 'Open mic',
    on: 'On',
    off: 'Off',
    details: 'Ipakita ang voice controls',
    closeDetails: 'Itago ang voice controls',
    viewProfile: 'Tingnan ang profile',
    addFriend: 'Add friend',
    mute: 'Mute',
    unmute: 'Unmute',
    volume: 'Volume',
    friendRequestFailed: 'Hindi naipadala ang friend request.'
  },
  th: {
    partyVoice: 'เสียงปาร์ตี้',
    teamVoice: 'เสียงทีม',
    serverVoice: 'เสียงเซิร์ฟเวอร์',
    connected: 'เชื่อมต่อแล้ว',
    disconnected: 'ตัดการเชื่อมต่อ',
    members: '{{count}} คนในเสียง',
    micReady: 'ไมค์พร้อม',
    micIdle: 'ไมค์ไม่ได้ใช้งาน',
    talking: 'กำลังพูด',
    openMic: 'เปิดไมค์ค้าง',
    on: 'เปิด',
    off: 'ปิด',
    details: 'แสดงการควบคุมเสียง',
    closeDetails: 'ซ่อนการควบคุมเสียง',
    viewProfile: 'ดูโปรไฟล์',
    addFriend: 'เพิ่มเพื่อน',
    mute: 'ปิดเสียง',
    unmute: 'เปิดเสียง',
    volume: 'ระดับเสียง',
    friendRequestFailed: 'ส่งคำขอเป็นเพื่อนไม่สำเร็จ'
  },
  id: {
    partyVoice: 'Suara party',
    teamVoice: 'Suara tim',
    serverVoice: 'Suara server',
    connected: 'Terhubung',
    disconnected: 'Terputus',
    members: '{{count}} di suara',
    micReady: 'Mikrofon siap',
    micIdle: 'Mikrofon diam',
    talking: 'Berbicara',
    openMic: 'Mikrofon terbuka',
    on: 'Aktif',
    off: 'Mati',
    details: 'Tampilkan kontrol suara',
    closeDetails: 'Sembunyikan kontrol suara',
    viewProfile: 'Lihat profil',
    addFriend: 'Tambah teman',
    mute: 'Bisukan',
    unmute: 'Bunyikan',
    volume: 'Volume',
    friendRequestFailed: 'Gagal mengirim permintaan teman.'
  },
  hi: {
    partyVoice: 'पार्टी वॉइस',
    teamVoice: 'टीम वॉइस',
    serverVoice: 'सर्वर वॉइस',
    connected: 'जुड़ा हुआ',
    disconnected: 'डिस्कनेक्ट',
    members: 'वॉइस में {{count}}',
    micReady: 'माइक तैयार',
    micIdle: 'माइक निष्क्रिय',
    talking: 'बोल रहे हैं',
    openMic: 'ओपन माइक',
    on: 'चालू',
    off: 'बंद',
    details: 'वॉइस नियंत्रण दिखाएँ',
    closeDetails: 'वॉइस नियंत्रण छिपाएँ',
    viewProfile: 'प्रोफ़ाइल देखें',
    addFriend: 'दोस्त जोड़ें',
    mute: 'म्यूट',
    unmute: 'अनम्यूट',
    volume: 'आवाज़',
    friendRequestFailed: 'दोस्ती का अनुरोध नहीं भेज सके।'
  },
  pt: {
    partyVoice: 'Voz do grupo',
    teamVoice: 'Voz da equipe',
    serverVoice: 'Voz do servidor',
    connected: 'Conectado',
    disconnected: 'Desconectado',
    members: '{{count}} na voz',
    micReady: 'Microfone pronto',
    micIdle: 'Microfone inativo',
    talking: 'Falando',
    openMic: 'Microfone aberto',
    on: 'Ligado',
    off: 'Desligado',
    details: 'Mostrar controles de voz',
    closeDetails: 'Ocultar controles de voz',
    viewProfile: 'Ver perfil',
    addFriend: 'Adicionar amigo',
    mute: 'Silenciar',
    unmute: 'Ativar som',
    volume: 'Volume',
    friendRequestFailed: 'Não foi possível enviar o pedido de amizade.'
  },
  ja: {
    partyVoice: 'パーティーボイス',
    teamVoice: 'チームボイス',
    serverVoice: 'サーバーボイス',
    connected: '接続中',
    disconnected: '切断中',
    members: 'ボイス参加: {{count}}人',
    micReady: 'マイク準備完了',
    micIdle: 'マイク待機中',
    talking: '発話中',
    openMic: 'オープンマイク',
    on: 'オン',
    off: 'オフ',
    details: 'ボイス操作を表示',
    closeDetails: 'ボイス操作を隠す',
    viewProfile: 'プロフィールを見る',
    addFriend: 'フレンド追加',
    mute: 'ミュート',
    unmute: 'ミュート解除',
    volume: '音量',
    friendRequestFailed: 'フレンド申請を送れませんでした。'
  }
}
const more: Record<SupportedLanguageCode, Record<MoreKey, string>> = {
  en: {
    pttTest: 'PTT test',
    holdToTalk: 'Hold to talk',
    holdPartyTalk: 'Hold for party',
    disconnectVoice: 'Disconnect voice',
    retryVoice: 'Retry voice',
    reconnectVoice: 'Reconnect voice',
    waitingForPeer: 'Waiting for another player in voice.',
    micPermissionHint: 'Use Open mic to allow microphone access.',
    micPermissionPttHint: 'Use Open mic or Hold to talk to allow microphone access.',
    bindHint: 'Use Open mic or bind game voice commands in Settings.',
    partyPttHint: 'Hold {{key}} for Party talk while the launcher is focused.',
    partnerOpenMicHint:
      'Open mic reaches your team and party, including party members on the other team.',
    peerConnected: 'Connected',
    peerConnecting: 'Connecting',
    peerDisconnected: 'Disconnected'
  },
  ru: {
    pttTest: 'Проверка PTT',
    holdToTalk: 'Удерживать для разговора',
    holdPartyTalk: 'Удерживать для группы',
    disconnectVoice: 'Отключить голос',
    retryVoice: 'Повторить голос',
    reconnectVoice: 'Переподключить голос',
    waitingForPeer: 'Ожидаем другого игрока в голосе.',
    micPermissionHint: 'Включите открытый микрофон, чтобы разрешить доступ.',
    micPermissionPttHint:
      'Включите открытый микрофон или удерживайте разговор, чтобы разрешить доступ.',
    bindHint: 'Включите открытый микрофон или настройте голосовые команды игры.',
    partyPttHint: 'Удерживайте {{key}} для голоса группы, когда лаунчер в фокусе.',
    partnerOpenMicHint:
      'Открытый микрофон слышат команда и группа, включая участников группы в другой команде.',
    peerConnected: 'Подключено',
    peerConnecting: 'Подключение',
    peerDisconnected: 'Отключено'
  },
  tl: {
    pttTest: 'PTT test',
    holdToTalk: 'Hold to talk',
    holdPartyTalk: 'Hold para sa party',
    disconnectVoice: 'Disconnect voice',
    retryVoice: 'Retry voice',
    reconnectVoice: 'Reconnect voice',
    waitingForPeer: 'Waiting sa ibang player sa voice.',
    micPermissionHint: 'Gamitin ang Open mic para payagan ang microphone.',
    micPermissionPttHint: 'Gamitin ang Open mic o Hold to talk para payagan ang microphone.',
    bindHint: 'Gamitin ang Open mic o i-bind ang game voice commands sa Settings.',
    partyPttHint: 'I-hold ang {{key}} para sa Party talk habang naka-focus ang launcher.',
    partnerOpenMicHint:
      'Maririnig ang open mic ng team at party, pati party members sa kabilang team.',
    peerConnected: 'Connected',
    peerConnecting: 'Connecting',
    peerDisconnected: 'Disconnected'
  },
  th: {
    pttTest: 'ทดสอบ PTT',
    holdToTalk: 'กดค้างเพื่อพูด',
    holdPartyTalk: 'กดค้างเพื่อคุยกับปาร์ตี้',
    disconnectVoice: 'ตัดเสียง',
    retryVoice: 'ลองเสียงอีกครั้ง',
    reconnectVoice: 'เชื่อมต่อเสียงใหม่',
    waitingForPeer: 'รอผู้เล่นคนอื่นในเสียง',
    micPermissionHint: 'ใช้ไมค์เปิดค้างเพื่ออนุญาตไมโครโฟน',
    micPermissionPttHint: 'ใช้ไมค์เปิดค้างหรือกดค้างเพื่ออนุญาตไมโครโฟน',
    bindHint: 'ใช้ไมค์เปิดค้างหรือตั้งค่าปุ่มเสียงของเกม',
    partyPttHint: 'กด {{key}} ค้างเพื่อพูดกับปาร์ตี้เมื่อหน้าลอนเชอร์อยู่ด้านหน้า',
    partnerOpenMicHint: 'ไมค์เปิดค้างจะส่งเสียงถึงทีมและปาร์ตี้ รวมถึงสมาชิกปาร์ตี้ในทีมตรงข้าม',
    peerConnected: 'เชื่อมต่อแล้ว',
    peerConnecting: 'กำลังเชื่อมต่อ',
    peerDisconnected: 'ตัดการเชื่อมต่อ'
  },
  id: {
    pttTest: 'Tes PTT',
    holdToTalk: 'Tahan untuk bicara',
    holdPartyTalk: 'Tahan untuk party',
    disconnectVoice: 'Putuskan suara',
    retryVoice: 'Coba suara lagi',
    reconnectVoice: 'Sambungkan suara lagi',
    waitingForPeer: 'Menunggu pemain lain di suara.',
    micPermissionHint: 'Gunakan mikrofon terbuka untuk mengizinkan akses.',
    micPermissionPttHint: 'Gunakan mikrofon terbuka atau tahan untuk bicara agar akses diizinkan.',
    bindHint: 'Gunakan mikrofon terbuka atau atur tombol suara game di Pengaturan.',
    partyPttHint: 'Tahan {{key}} untuk bicara dengan party saat launcher aktif.',
    partnerOpenMicHint:
      'Mikrofon terbuka didengar tim dan party, termasuk anggota party di tim lawan.',
    peerConnected: 'Terhubung',
    peerConnecting: 'Menghubungkan',
    peerDisconnected: 'Terputus'
  },
  hi: {
    pttTest: 'PTT जाँच',
    holdToTalk: 'बोलने के लिए दबाएँ',
    holdPartyTalk: 'पार्टी से बात करने के लिए दबाएँ',
    disconnectVoice: 'वॉइस डिस्कनेक्ट करें',
    retryVoice: 'वॉइस फिर आज़माएँ',
    reconnectVoice: 'वॉइस फिर जोड़ें',
    waitingForPeer: 'वॉइस में दूसरे खिलाड़ी का इंतज़ार है।',
    micPermissionHint: 'माइक अनुमति के लिए ओपन माइक इस्तेमाल करें।',
    micPermissionPttHint: 'माइक अनुमति के लिए ओपन माइक या बोलने वाला बटन इस्तेमाल करें।',
    bindHint: 'ओपन माइक इस्तेमाल करें या सेटिंग में गेम वॉइस बटन बाँधें।',
    partyPttHint: 'लॉन्चर सक्रिय होने पर पार्टी से बोलने के लिए {{key}} दबाएँ।',
    partnerOpenMicHint:
      'ओपन माइक आपकी टीम और पार्टी को सुनाई देता है, दूसरी टीम के पार्टी सदस्यों को भी।',
    peerConnected: 'जुड़ा हुआ',
    peerConnecting: 'जुड़ रहा है',
    peerDisconnected: 'डिस्कनेक्ट'
  },
  pt: {
    pttTest: 'Teste PTT',
    holdToTalk: 'Segure para falar',
    holdPartyTalk: 'Segure para falar com o grupo',
    disconnectVoice: 'Desconectar voz',
    retryVoice: 'Tentar voz novamente',
    reconnectVoice: 'Reconectar voz',
    waitingForPeer: 'Aguardando outro jogador na voz.',
    micPermissionHint: 'Use o microfone aberto para permitir acesso.',
    micPermissionPttHint: 'Use o microfone aberto ou segure para falar para permitir acesso.',
    bindHint: 'Use o microfone aberto ou configure as teclas de voz do jogo.',
    partyPttHint: 'Segure {{key}} para falar com o grupo enquanto o launcher está em foco.',
    partnerOpenMicHint:
      'O microfone aberto transmite para a equipe e o grupo, inclusive membros do grupo na equipe adversária.',
    peerConnected: 'Conectado',
    peerConnecting: 'Conectando',
    peerDisconnected: 'Desconectado'
  },
  ja: {
    pttTest: 'PTTテスト',
    holdToTalk: '押して話す',
    holdPartyTalk: '押してパーティーと話す',
    disconnectVoice: 'ボイスを切断',
    retryVoice: 'ボイスを再試行',
    reconnectVoice: 'ボイスを再接続',
    waitingForPeer: 'ほかのプレイヤーを待っています。',
    micPermissionHint: 'オープンマイクでマイクの使用を許可してください。',
    micPermissionPttHint: 'オープンマイクか押して話す操作でマイクを許可してください。',
    bindHint: 'オープンマイクを使うか、設定でゲームのボイスキーを割り当ててください。',
    partyPttHint: 'ランチャー操作中に{{key}}を押してパーティーに話します。',
    partnerOpenMicHint:
      'オープンマイクはチームとパーティーに届き、相手チームのパーティーメンバーにも聞こえます。',
    peerConnected: '接続中',
    peerConnecting: '接続しています',
    peerDisconnected: '切断中'
  }
}

export function useVoiceDockText(): (
  key: Key | MoreKey,
  params?: Record<string, string | number>
) => string {
  const { language } = useTranslation()
  return (key, params) => {
    let value = key in copy[language] ? copy[language][key as Key] : more[language][key as MoreKey]
    for (const [name, replacement] of Object.entries(params ?? {}))
      value = value.replaceAll(`{{${name}}}`, String(replacement))
    return value
  }
}
