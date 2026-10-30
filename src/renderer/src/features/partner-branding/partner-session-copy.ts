import { useTranslation, type SupportedLanguageCode } from '../i18n/i18n'

const keys = ['launch', 'back', 'hint', 'players', 'empty', 'mute', 'unmute', 'volume'] as const
const rows: Record<SupportedLanguageCode, string[]> = {
  en: [
    'Launch Counter-Strike',
    'Back to servers',
    'Disconnect in the game menu to leave the server. This list shows linked platform accounts confirmed by the server.',
    'Players',
    'No linked players are available.',
    'Mute',
    'Unmute',
    'Volume'
  ],
  ru: [
    'Запустить Counter-Strike',
    'К списку серверов',
    'Чтобы выйти с сервера, отключитесь в меню игры. Здесь показаны привязанные аккаунты платформы, подтверждённые сервером.',
    'Игроки',
    'Нет доступных привязанных игроков.',
    'Выключить звук',
    'Включить звук',
    'Громкость'
  ],
  tl: [
    'Buksan ang Counter-Strike',
    'Bumalik sa mga server',
    'Mag-disconnect sa menu ng laro para umalis sa server. Ipinapakita rito ang mga naka-link na platform account na kinumpirma ng server.',
    'Mga manlalaro',
    'Walang available na naka-link na manlalaro.',
    'I-mute',
    'I-unmute',
    'Lakas ng tunog'
  ],
  th: [
    'เปิด Counter-Strike',
    'กลับไปยังเซิร์ฟเวอร์',
    'ตัดการเชื่อมต่อในเมนูเกมเพื่อออกจากเซิร์ฟเวอร์ รายชื่อนี้แสดงบัญชีแพลตฟอร์มที่เชื่อมโยงและได้รับการยืนยันจากเซิร์ฟเวอร์',
    'ผู้เล่น',
    'ไม่มีผู้เล่นที่เชื่อมโยงให้แสดง',
    'ปิดเสียง',
    'เปิดเสียง',
    'ระดับเสียง'
  ],
  id: [
    'Buka Counter-Strike',
    'Kembali ke server',
    'Putuskan koneksi di menu game untuk keluar dari server. Daftar ini menampilkan akun platform tertaut yang dikonfirmasi server.',
    'Pemain',
    'Tidak ada pemain tertaut yang tersedia.',
    'Bisukan',
    'Bunyikan',
    'Volume'
  ],
  pt: [
    'Iniciar Counter-Strike',
    'Voltar aos servidores',
    'Desconecte no menu do jogo para sair do servidor. Esta lista mostra contas vinculadas à plataforma confirmadas pelo servidor.',
    'Jogadores',
    'Nenhum jogador vinculado disponível.',
    'Silenciar',
    'Ativar som',
    'Volume'
  ],
  ja: [
    'Counter-Strike を起動',
    'サーバー一覧に戻る',
    'サーバーから退出するにはゲームのメニューで切断してください。この一覧にはサーバーが確認した連携済みのプラットフォームアカウントが表示されます。',
    'プレイヤー',
    '表示できる連携済みプレイヤーはいません。',
    'ミュート',
    'ミュート解除',
    '音量'
  ],
  hi: [
    'Counter-Strike शुरू करें',
    'सर्वर सूची पर लौटें',
    'सर्वर छोड़ने के लिए गेम मेन्यू में डिस्कनेक्ट करें। इस सूची में सर्वर द्वारा पुष्टि किए गए लिंक किए गए प्लेटफ़ॉर्म खाते दिखते हैं।',
    'खिलाड़ी',
    'कोई लिंक किया गया खिलाड़ी उपलब्ध नहीं है।',
    'म्यूट करें',
    'अनम्यूट करें',
    'आवाज़'
  ]
}

export function usePartnerSessionText(): (key: (typeof keys)[number]) => string {
  const { language } = useTranslation()
  return (key) => rows[language][keys.indexOf(key)]
}
