import { useCallback } from 'react'
import { create } from 'zustand'

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ru', label: 'Русский' },
  { code: 'tl', label: 'Taglish' },
  { code: 'th', label: 'ไทย' },
  { code: 'id', label: 'Bahasa Indonesia' },
  { code: 'pt', label: 'Português' }
] as const

// Kept for the original Russian/Taglish runtime catalogs so they do not need
// to be rewritten when additional language packs are added.
export type LanguageCode = 'en' | 'ru' | 'tl'
export type SupportedLanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code']

const english = {
  'nav.lobbyNavigation': 'Lobby navigation',
  'nav.home': 'Home',
  'nav.settings': 'Settings',
  'nav.inventory': 'Inventory',
  'nav.leaderboard': 'Leaderboard',
  'nav.play': 'Play',
  'nav.store': 'Store',
  'nav.news': 'News',
  'settings.language.title': 'Language',
  'settings.language.description': 'Choose the language used by the launcher interface.',
  'settings.language.help': 'Changes apply immediately and are saved on this device.',
  'auth.restoring': 'Restoring your session',
  'auth.welcomeBack': 'Welcome back',
  'auth.createAccount': 'Create an account',
  'auth.loginDescription': 'Sign in to continue to matchmaking.',
  'auth.registerDescription': 'Choose how you want to create your account.',
  'auth.login': 'Login',
  'auth.register': 'Register',
  'auth.or': 'or',
  'auth.username': 'Username',
  'auth.usernameHint': '3–32 characters: letters, numbers, and underscores',
  'auth.email': 'Email',
  'auth.password': 'Password',
  'auth.passwordPlaceholder': 'At least 8 characters',
  'auth.signingIn': 'Signing in…',
  'auth.signIn': 'Sign in',
  'auth.createAccountButton': 'Create account',
  'auth.continueFacebook': 'Continue with Facebook',
  'auth.exitDesktop': 'Exit to desktop',
  'auth.privacyPolicy': 'Privacy Policy',
  'auth.terms': 'Terms & Conditions',
  'auth.finishSocial': 'Finish {{action}} with {{provider}} in your browser.',
  'auth.finishSigningIn': 'signing in',
  'auth.finishCreatingAccount': 'creating your account',
  'auth.facebookEmailHint': 'Facebook did not provide an email address. Add one to continue.'
  'gift.arrived': "A gift has arrived",
  'gift.welcomeTitle': "WELCOME GIFT",
  'gift.intro': "One of these skins is yours. Choose wisely.",
  'gift.newPlayerReward': "New player reward",
  'gift.specialReward': "Special reward",
  'gift.welcomeMessage': "We truly appreciate you playing the early alpha release of 1.6 Competitive! As a welcome gift, please select one of the skins below.",
  'gift.choose': "Choose this skin",
  'gift.owned': "Already owned",
  'gift.claiming': "Claiming",
  'gift.unlocked': "Unlocked",
  'gift.yours': "Yours",
  'gift.previewUnavailable': "Preview unavailable",
} as const

export type TranslationKey = keyof typeof english
export type TranslationParams = Record<string, string | number>

const russian: Record<TranslationKey, string> = {
  'nav.lobbyNavigation': 'Навигация лобби',
  'nav.home': 'Главная',
  'nav.settings': 'Настройки',
  'nav.inventory': 'Инвентарь',
  'nav.leaderboard': 'Рейтинг',
  'nav.play': 'Играть',
  'nav.store': 'Магазин',
  'nav.news': 'Новости',
  'settings.language.title': 'Язык',
  'settings.language.description': 'Выберите язык интерфейса лаунчера.',
  'settings.language.help': 'Изменения применяются сразу и сохраняются на этом устройстве.',
  'auth.restoring': 'Восстановление сессии',
  'auth.welcomeBack': 'С возвращением',
  'auth.createAccount': 'Создать аккаунт',
  'auth.loginDescription': 'Войдите, чтобы продолжить поиск матча.',
  'auth.registerDescription': 'Выберите способ создания аккаунта.',
  'auth.login': 'Вход',
  'auth.register': 'Регистрация',
  'auth.or': 'или',
  'auth.username': 'Имя игрока',
  'auth.usernameHint': '3–32 символа: буквы, цифры и подчеркивания',
  'auth.email': 'Email',
  'auth.password': 'Пароль',
  'auth.passwordPlaceholder': 'Не менее 8 символов',
  'auth.signingIn': 'Вход…',
  'auth.signIn': 'Войти',
  'auth.createAccountButton': 'Создать аккаунт',
  'auth.continueFacebook': 'Продолжить с Facebook',
  'auth.exitDesktop': 'Закрыть лаунчер',
  'auth.privacyPolicy': 'Политика конфиденциальности',
  'auth.terms': 'Условия использования',
  'auth.finishSocial': 'Завершите {{action}} через {{provider}} в браузере.',
  'auth.finishSigningIn': 'вход',
  'auth.finishCreatingAccount': 'создание аккаунта',
  'auth.facebookEmailHint': 'Facebook не передал email. Добавьте его, чтобы продолжить.'
  'gift.arrived': "Вам пришёл подарок",
  'gift.welcomeTitle': "ПРИВЕТСТВЕННЫЙ ПОДАРОК",
  'gift.intro': "Один из этих скинов ваш. Выбирайте.",
  'gift.newPlayerReward': "Награда новому игроку",
  'gift.specialReward': "Особая награда",
  'gift.welcomeMessage': "Спасибо, что играете в раннюю альфа-версию 1.6 Competitive! В качестве приветственного подарка выберите один из скинов ниже.",
  'gift.choose': "Выбрать этот скин",
  'gift.owned': "Уже есть",
  'gift.claiming': "Получение…",
  'gift.unlocked': "Разблокировано",
  'gift.yours': "Ваш",
  'gift.previewUnavailable': "Предпросмотр недоступен",
}

const taglish: Record<TranslationKey, string> = {
  'nav.lobbyNavigation': 'Lobby navigation',
  'nav.home': 'Home',
  'nav.settings': 'Settings',
  'nav.inventory': 'Inventory',
  'nav.leaderboard': 'Leaderboard',
  'nav.play': 'Play',
  'nav.store': 'Store',
  'nav.news': 'News',
  'settings.language.title': 'Language',
  'settings.language.description': 'Piliin ang language ng launcher interface.',
  'settings.language.help': 'Apply agad ang changes at mase-save sa device na ito.',
  'auth.restoring': 'Nire-restore ang session mo',
  'auth.welcomeBack': 'Welcome back',
  'auth.createAccount': 'Create account',
  'auth.loginDescription': 'Mag-sign in para makapag-matchmaking.',
  'auth.registerDescription': 'Piliin kung paano mo gustong gumawa ng account.',
  'auth.login': 'Login',
  'auth.register': 'Register',
  'auth.or': 'or',
  'auth.username': 'Username',
  'auth.usernameHint': '3–32 characters: letters, numbers, at underscores',
  'auth.email': 'Email',
  'auth.password': 'Password',
  'auth.passwordPlaceholder': 'At least 8 characters',
  'auth.signingIn': 'Signing in…',
  'auth.signIn': 'Sign in',
  'auth.createAccountButton': 'Create account',
  'auth.continueFacebook': 'Continue with Facebook',
  'auth.exitDesktop': 'Exit to desktop',
  'auth.privacyPolicy': 'Privacy Policy',
  'auth.terms': 'Terms & Conditions',
  'auth.finishSocial': 'Tapusin ang {{action}} gamit ang {{provider}} sa browser mo.',
  'auth.finishSigningIn': 'pag-sign in',
  'auth.finishCreatingAccount': 'pag-create ng account',
  'auth.facebookEmailHint': 'Walang email na binigay ang Facebook. Mag-add para mag-continue.'
  'gift.arrived': "May gift ka!",
  'gift.welcomeTitle': "WELCOME GIFT",
  'gift.intro': "Isa sa mga skin na ito ay para sa iyo. Pili ka.",
  'gift.newPlayerReward': "New player reward",
  'gift.specialReward': "Special reward",
  'gift.welcomeMessage': "Maraming salamat sa paglalaro ng early alpha release ng 1.6 Competitive! Bilang welcome gift, pumili ng isa sa mga skin sa ibaba.",
  'gift.choose': "Piliin itong skin",
  'gift.owned': "Owned mo na",
  'gift.claiming': "Kinukuha…",
  'gift.unlocked': "Unlocked",
  'gift.yours': "Sa iyo na",
  'gift.previewUnavailable': "Walang preview",
}

const thai: Record<TranslationKey, string> = {
  'nav.lobbyNavigation': 'เมนูล็อบบี้',
  'nav.home': 'หน้าหลัก',
  'nav.settings': 'การตั้งค่า',
  'nav.inventory': 'คลัง',
  'nav.leaderboard': 'อันดับ',
  'nav.play': 'เล่น',
  'nav.store': 'ร้านค้า',
  'nav.news': 'ข่าว',
  'settings.language.title': 'ภาษา',
  'settings.language.description': 'เลือกภาษาที่ใช้ในหน้าต่างลอนเชอร์',
  'settings.language.help': 'การเปลี่ยนแปลงมีผลทันทีและจะบันทึกไว้ในอุปกรณ์นี้',
  'auth.restoring': 'กำลังกู้คืนเซสชันของคุณ',
  'auth.welcomeBack': 'ยินดีต้อนรับกลับ',
  'auth.createAccount': 'สร้างบัญชี',
  'auth.loginDescription': 'เข้าสู่ระบบเพื่อใช้งานการจับคู่',
  'auth.registerDescription': 'เลือกวิธีที่คุณต้องการใช้สร้างบัญชี',
  'auth.login': 'เข้าสู่ระบบ',
  'auth.register': 'สมัครสมาชิก',
  'auth.or': 'หรือ',
  'auth.username': 'ชื่อผู้ใช้',
  'auth.usernameHint': '3–32 ตัวอักษร: ตัวอักษร ตัวเลข และขีดล่าง',
  'auth.email': 'อีเมล',
  'auth.password': 'รหัสผ่าน',
  'auth.passwordPlaceholder': 'อย่างน้อย 8 ตัวอักษร',
  'auth.signingIn': 'กำลังเข้าสู่ระบบ…',
  'auth.signIn': 'เข้าสู่ระบบ',
  'auth.createAccountButton': 'สร้างบัญชี',
  'auth.continueFacebook': 'ดำเนินการต่อด้วย Facebook',
  'auth.exitDesktop': 'ออกไปยังเดสก์ท็อป',
  'auth.privacyPolicy': 'นโยบายความเป็นส่วนตัว',
  'auth.terms': 'ข้อกำหนดและเงื่อนไข',
  'auth.finishSocial': 'ดำเนินการ {{action}} ด้วย {{provider}} ให้เสร็จในเบราว์เซอร์',
  'auth.finishSigningIn': 'การเข้าสู่ระบบ',
  'auth.finishCreatingAccount': 'การสร้างบัญชี',
  'auth.facebookEmailHint': 'Facebook ไม่ได้ส่งอีเมลมาให้ โปรดเพิ่มอีเมลเพื่อดำเนินการต่อ'
  'gift.arrived': "คุณได้รับของขวัญ",
  'gift.welcomeTitle': "ของขวัญต้อนรับ",
  'gift.intro': "หนึ่งในสกินเหล่านี้เป็นของคุณ เลือกได้เลย",
  'gift.newPlayerReward': "รางวัลสำหรับผู้เล่นใหม่",
  'gift.specialReward': "รางวัลพิเศษ",
  'gift.welcomeMessage': "ขอบคุณมากที่ร่วมเล่น 1.6 Competitive เวอร์ชันอัลฟ่าช่วงแรก! เพื่อเป็นของขวัญต้อนรับ โปรดเลือกหนึ่งสกินด้านล่าง",
  'gift.choose': "เลือกสกินนี้",
  'gift.owned': "มีอยู่แล้ว",
  'gift.claiming': "กำลังรับ…",
  'gift.unlocked': "ปลดล็อกแล้ว",
  'gift.yours': "เป็นของคุณแล้ว",
  'gift.previewUnavailable': "ไม่มีตัวอย่าง",
}

const indonesian: Record<TranslationKey, string> = {
  'nav.lobbyNavigation': 'Navigasi lobi',
  'nav.home': 'Beranda',
  'nav.settings': 'Pengaturan',
  'nav.inventory': 'Inventaris',
  'nav.leaderboard': 'Papan peringkat',
  'nav.play': 'Main',
  'nav.store': 'Toko',
  'nav.news': 'Berita',
  'settings.language.title': 'Bahasa',
  'settings.language.description': 'Pilih bahasa yang digunakan oleh antarmuka launcher.',
  'settings.language.help': 'Perubahan diterapkan langsung dan disimpan di perangkat ini.',
  'auth.restoring': 'Memulihkan sesi Anda',
  'auth.welcomeBack': 'Selamat datang kembali',
  'auth.createAccount': 'Buat akun',
  'auth.loginDescription': 'Masuk untuk melanjutkan ke matchmaking.',
  'auth.registerDescription': 'Pilih cara Anda ingin membuat akun.',
  'auth.login': 'Masuk',
  'auth.register': 'Daftar',
  'auth.or': 'atau',
  'auth.username': 'Nama pengguna',
  'auth.usernameHint': '3–32 karakter: huruf, angka, dan garis bawah',
  'auth.email': 'Email',
  'auth.password': 'Kata sandi',
  'auth.passwordPlaceholder': 'Minimal 8 karakter',
  'auth.signingIn': 'Sedang masuk…',
  'auth.signIn': 'Masuk',
  'auth.createAccountButton': 'Buat akun',
  'auth.continueFacebook': 'Lanjutkan dengan Facebook',
  'auth.exitDesktop': 'Keluar ke desktop',
  'auth.privacyPolicy': 'Kebijakan Privasi',
  'auth.terms': 'Syarat & Ketentuan',
  'auth.finishSocial': 'Selesaikan {{action}} dengan {{provider}} di browser Anda.',
  'auth.finishSigningIn': 'proses masuk',
  'auth.finishCreatingAccount': 'pembuatan akun',
  'auth.facebookEmailHint':
    'Facebook tidak memberikan alamat email. Tambahkan email untuk melanjutkan.'
  'gift.arrived': "Hadiah telah tiba",
  'gift.welcomeTitle': "HADIAH SELAMAT DATANG",
  'gift.intro': "Salah satu skin ini milikmu. Silakan pilih.",
  'gift.newPlayerReward': "Hadiah pemain baru",
  'gift.specialReward': "Hadiah spesial",
  'gift.welcomeMessage': "Terima kasih banyak telah memainkan rilis early alpha 1.6 Competitive! Sebagai hadiah selamat datang, silakan pilih salah satu skin di bawah ini.",
  'gift.choose': "Pilih skin ini",
  'gift.owned': "Sudah dimiliki",
  'gift.claiming': "Mengklaim…",
  'gift.unlocked': "Terbuka",
  'gift.yours': "Milikmu",
  'gift.previewUnavailable': "Pratinjau tidak tersedia",
}

const portuguese: Record<TranslationKey, string> = {
  'nav.lobbyNavigation': 'Navegação do lobby',
  'nav.home': 'Início',
  'nav.settings': 'Configurações',
  'nav.inventory': 'Inventário',
  'nav.leaderboard': 'Ranking',
  'nav.play': 'Jogar',
  'nav.store': 'Loja',
  'nav.news': 'Notícias',
  'settings.language.title': 'Idioma',
  'settings.language.description': 'Escolha o idioma usado pela interface do launcher.',
  'settings.language.help': 'As alterações são aplicadas imediatamente e salvas neste dispositivo.',
  'auth.restoring': 'Restaurando sua sessão',
  'auth.welcomeBack': 'Bem-vindo de volta',
  'auth.createAccount': 'Criar uma conta',
  'auth.loginDescription': 'Entre para continuar para o matchmaking.',
  'auth.registerDescription': 'Escolha como deseja criar sua conta.',
  'auth.login': 'Entrar',
  'auth.register': 'Cadastrar',
  'auth.or': 'ou',
  'auth.username': 'Nome de usuário',
  'auth.usernameHint': '3–32 caracteres: letras, números e sublinhados',
  'auth.email': 'E-mail',
  'auth.password': 'Senha',
  'auth.passwordPlaceholder': 'Pelo menos 8 caracteres',
  'auth.signingIn': 'Entrando…',
  'auth.signIn': 'Entrar',
  'auth.createAccountButton': 'Criar conta',
  'auth.continueFacebook': 'Continuar com Facebook',
  'auth.exitDesktop': 'Sair para a área de trabalho',
  'auth.privacyPolicy': 'Política de Privacidade',
  'auth.terms': 'Termos e Condições',
  'auth.finishSocial': 'Conclua {{action}} com {{provider}} no seu navegador.',
  'auth.finishSigningIn': 'o login',
  'auth.finishCreatingAccount': 'a criação da sua conta',
  'auth.facebookEmailHint':
    'O Facebook não forneceu um endereço de e-mail. Adicione um para continuar.'
  'gift.arrived': "Um presente chegou",
  'gift.welcomeTitle': "PRESENTE DE BOAS-VINDAS",
  'gift.intro': "Uma destas skins é sua. Escolha com cuidado.",
  'gift.newPlayerReward': "Recompensa de novo jogador",
  'gift.specialReward': "Recompensa especial",
  'gift.welcomeMessage': "Agradecemos muito por jogar a versão early alpha de 1.6 Competitive! Como presente de boas-vindas, escolha uma das skins abaixo.",
  'gift.choose': "Escolher esta skin",
  'gift.owned': "Já possui",
  'gift.claiming': "Resgatando…",
  'gift.unlocked': "Desbloqueada",
  'gift.yours': "É sua",
  'gift.previewUnavailable': "Prévia indisponível",
}

const translations: Record<SupportedLanguageCode, Record<TranslationKey, string>> = {
  en: english,
  ru: russian,
  tl: taglish,
  th: thai,
  id: indonesian,
  pt: portuguese
}

const STORAGE_KEY = '16competitive.language'

export const isLanguageCode = (value: unknown): value is SupportedLanguageCode =>
  SUPPORTED_LANGUAGES.some((language) => language.code === value)

export const isLegacyRuntimeLanguage = (value: SupportedLanguageCode): value is LanguageCode =>
  value === 'en' || value === 'ru' || value === 'tl'

const readStoredLanguage = (): SupportedLanguageCode => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return isLanguageCode(stored) ? stored : 'en'
  } catch {
    return 'en'
  }
}

const applyDocumentLanguage = (language: SupportedLanguageCode): void => {
  if (typeof document !== 'undefined') document.documentElement.lang = language
}

const persistLanguage = (language: SupportedLanguageCode): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, language)
  } catch {
    // Language preference is non-critical. Keep the in-memory value if storage is unavailable.
  }
}

interface LanguageState {
  language: SupportedLanguageCode
  setLanguage: (language: SupportedLanguageCode) => void
}

const initialLanguage = readStoredLanguage()
applyDocumentLanguage(initialLanguage)

export const useLanguageStore = create<LanguageState>((set) => ({
  language: initialLanguage,
  setLanguage: (language) => {
    persistLanguage(language)
    applyDocumentLanguage(language)
    set({ language })
  }
}))

export const translate = (
  language: SupportedLanguageCode,
  key: TranslationKey,
  params?: TranslationParams
): string => {
  let translated = translations[language]?.[key] ?? english[key]
  if (!params) return translated

  for (const [name, value] of Object.entries(params)) {
    translated = translated.split(`{{${name}}}`).join(String(value))
  }
  return translated
}

export function useTranslation(): {
  language: SupportedLanguageCode
  t: (key: TranslationKey, params?: TranslationParams) => string
} {
  const language = useLanguageStore((state) => state.language)
  const t = useCallback(
    (key: TranslationKey, params?: TranslationParams) => translate(language, key, params),
    [language]
  )
  return { language, t }
}
