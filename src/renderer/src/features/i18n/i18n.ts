import { useCallback } from 'react'
import { create } from 'zustand'

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ru', label: 'Русский' },
  { code: 'tl', label: 'Taglish' },
  { code: 'th', label: 'ไทย' },
  { code: 'id', label: 'Bahasa Indonesia' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'pt', label: 'Português' },
  { code: 'ja', label: '日本語' }
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
  'settings.usernameCooldown': 'You can change your username again on {{date}}.',
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
  'auth.facebookEmailHint': 'Facebook did not provide an email address. Add one to continue.',
  'gift.arrived': 'A gift has arrived',
  'gift.welcomeTitle': 'WELCOME GIFT',
  'gift.intro': 'One of these rewards is yours. Choose wisely.',
  'gift.newPlayerReward': 'New player reward',
  'gift.specialReward': 'Special reward',
  'gift.welcomeMessage':
    'We truly appreciate you playing the early alpha release of 1.6 Competitive! As a welcome gift, please select one of the rewards below.',
  'gift.choose': 'Choose this reward',
  'gift.skinReward': 'Custom weapon skin.',
  'gift.currencyReward': 'Currency reward added directly to your account.',
  'gift.owned': 'Already owned',
  'gift.claiming': 'Claiming',
  'gift.unlocked': 'Unlocked',
  'gift.yours': 'Yours',
  'gift.previewUnavailable': 'Preview unavailable',
  'gift.decideLater': "I can't decide yet",
  'matchmaking.playWindow':
    '+{{points}} points per eligible completed match · {{start}}–{{end}} ({{timeZone}})',
  'matchmaking.playWindowReward': 'Playtime window bonus',
  'matchmaking.playWindowActive': 'Bonus active now',
  'matchmaking.playWindowInactive': 'Outside bonus hours',
  'matchmaking.playWindowUnavailable': 'Bonus hours unavailable',
  'matchmaking.playWindowEarned': '+{{points}} bonus points earned',
  'matchmaking.playWindowNotEarned': 'No playtime bonus this match',
  'matchmaking.playWindowResultUnavailable': 'Bonus result unavailable',
  'matchmaking.preferHumans': 'Prefer humans',
  'matchmaking.modeHelp5v5': 'Rated 5v5 with MMR progression. First team to 13 rounds wins.',
  'matchmaking.modeHelpUnrated': 'Unrated 5v5. First team to 9 rounds wins; MMR does not change.',
  'matchmaking.modeHelpLegacy': 'Unrated 5v5 with CS 1.3 movement. First team to 9 rounds wins.',
  'matchmaking.modeHelpFfa': 'Free-for-all deathmatch. First player to 50 kills wins.',
  'matchmaking.modeHelpFightYard': 'Team Fight Yard. First team to 90 kills wins.',
  'matchmaking.modeHelp3v3': 'Unrated 3v3. First team to 13 rounds wins.',
  'matchmaking.preferHumansTooltip':
    'Prioritizes human players and delays automatic bot fill. Bots can still join if another player opts in or the mode allows them.',
  'matchmaking.playWindowTooltip':
    'The assigned match node decides the bonus when the match starts. Connect and complete an all-human matchmaking match during its published hours. Custom games and bot matches do not qualify.'
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
  'settings.usernameCooldown': 'Вы сможете снова изменить имя пользователя {{date}}.',
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
  'auth.facebookEmailHint': 'Facebook не передал email. Добавьте его, чтобы продолжить.',
  'gift.arrived': 'Вам пришёл подарок',
  'gift.welcomeTitle': 'ПРИВЕТСТВЕННЫЙ ПОДАРОК',
  'gift.intro': 'Одна из этих наград ваша. Выбирайте.',
  'gift.newPlayerReward': 'Награда новому игроку',
  'gift.specialReward': 'Особая награда',
  'gift.welcomeMessage':
    'Спасибо, что играете в раннюю альфа-версию 1.6 Competitive! В качестве приветственного подарка выберите одну из наград ниже.',
  'gift.choose': 'Выбрать эту награду',
  'gift.skinReward': 'Пользовательский скин оружия.',
  'gift.currencyReward': 'Валюта будет сразу добавлена на ваш аккаунт.',
  'gift.owned': 'Уже есть',
  'gift.claiming': 'Получение…',
  'gift.unlocked': 'Разблокировано',
  'gift.yours': 'Ваш',
  'gift.previewUnavailable': 'Предпросмотр недоступен',
  'gift.decideLater': 'Я пока не могу выбрать',
  'matchmaking.playWindow':
    '+{{points}} очков за завершённый подходящий матч · {{start}}–{{end}} ({{timeZone}})',
  'matchmaking.playWindowReward': 'Бонус игрового времени',
  'matchmaking.playWindowActive': 'Бонус сейчас действует',
  'matchmaking.playWindowInactive': 'Вне бонусных часов',
  'matchmaking.playWindowUnavailable': 'Бонусные часы недоступны',
  'matchmaking.playWindowEarned': 'Получено +{{points}} бонусных очков',
  'matchmaking.playWindowNotEarned': 'Без бонуса за этот матч',
  'matchmaking.playWindowResultUnavailable': 'Результат бонуса недоступен',
  'matchmaking.preferHumans': 'Предпочитать игроков',
  'matchmaking.modeHelp5v5':
    'Рейтинговый 5 на 5 с изменением MMR. Побеждает команда, первой выигравшая 13 раундов.',
  'matchmaking.modeHelpUnrated': 'Нерейтинговый 5 на 5. Победа за 9 раундов; MMR не меняется.',
  'matchmaking.modeHelpLegacy': 'Нерейтинговый 5 на 5 с движением CS 1.3. Победа за 9 раундов.',
  'matchmaking.modeHelpFfa': 'Бой каждый за себя. Побеждает первый игрок с 50 убийствами.',
  'matchmaking.modeHelpFightYard':
    'Командный Fight Yard. Побеждает первая команда с 90 убийствами.',
  'matchmaking.modeHelp3v3': 'Нерейтинговый 3 на 3. Победа за 13 раундов.',
  'matchmaking.preferHumansTooltip':
    'Приоритет живым игрокам и более позднее автоматическое добавление ботов. Боты всё же возможны, если другой игрок согласится или режим их допускает.',
  'matchmaking.playWindowTooltip':
    'Бонус определяется назначенным сервером при начале матча. Подключитесь и завершите матч подбора только с людьми в опубликованные часы сервера. Пользовательские игры и матчи с ботами не подходят.'
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
  'settings.usernameCooldown': 'Puwede mong baguhin ulit ang username mo sa {{date}}.',
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
  'auth.facebookEmailHint': 'Walang email na binigay ang Facebook. Mag-add para mag-continue.',
  'gift.arrived': 'May gift ka!',
  'gift.welcomeTitle': 'WELCOME GIFT',
  'gift.intro': 'Isa sa mga reward na ito ay para sa iyo. Pili ka.',
  'gift.newPlayerReward': 'New player reward',
  'gift.specialReward': 'Special reward',
  'gift.welcomeMessage':
    'Maraming salamat sa paglalaro ng early alpha release ng 1.6 Competitive! Bilang welcome gift, pumili ng isa sa mga reward sa ibaba.',
  'gift.choose': 'Piliin itong reward',
  'gift.skinReward': 'Custom weapon skin.',
  'gift.currencyReward': 'Currency reward na direktang madadagdag sa account mo.',
  'gift.owned': 'Owned mo na',
  'gift.claiming': 'Kinukuha…',
  'gift.unlocked': 'Unlocked',
  'gift.yours': 'Sa iyo na',
  'gift.previewUnavailable': 'Walang preview',
  'gift.decideLater': 'Di pa ako makapag-decide',
  'matchmaking.playWindow':
    '+{{points}} points kada eligible na natapos na match · {{start}}–{{end}} ({{timeZone}})',
  'matchmaking.playWindowReward': 'Playtime window bonus',
  'matchmaking.playWindowActive': 'Active ang bonus ngayon',
  'matchmaking.playWindowInactive': 'Labas sa bonus hours',
  'matchmaking.playWindowUnavailable': 'Walang bonus hours na available',
  'matchmaking.playWindowEarned': 'Nakuha ang +{{points}} bonus points',
  'matchmaking.playWindowNotEarned': 'Walang playtime bonus sa match na ito',
  'matchmaking.playWindowResultUnavailable': 'Hindi available ang bonus result',
  'matchmaking.preferHumans': 'Mas piliin ang tao',
  'matchmaking.modeHelp5v5':
    'Rated 5v5 na may MMR progression. Unang team sa 13 rounds ang panalo.',
  'matchmaking.modeHelpUnrated':
    'Unrated 5v5. Unang team sa 9 rounds ang panalo; walang pagbabago sa MMR.',
  'matchmaking.modeHelpLegacy':
    'Unrated 5v5 na may CS 1.3 movement. Unang team sa 9 rounds ang panalo.',
  'matchmaking.modeHelpFfa': 'Free-for-all deathmatch. Unang player sa 50 kills ang panalo.',
  'matchmaking.modeHelpFightYard': 'Team Fight Yard. Unang team sa 90 kills ang panalo.',
  'matchmaking.modeHelp3v3': 'Unrated 3v3. Unang team sa 13 rounds ang panalo.',
  'matchmaking.preferHumansTooltip':
    'Mas inuuna ang mga taong player at pinapahuli ang automatic bot fill. Posible pa rin ang bots kung may ibang player na mag-opt in o pinapayagan ng mode.',
  'matchmaking.playWindowTooltip':
    'Ang assigned match node ang magtatakda ng bonus sa simula ng match. Kumonekta at tapusin ang matchmade game na puro tao sa published hours nito. Hindi eligible ang custom games at matches na may bots.'
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
  'settings.usernameCooldown': 'คุณเปลี่ยนชื่อผู้ใช้อีกครั้งได้ในวันที่ {{date}}',
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
  'auth.facebookEmailHint': 'Facebook ไม่ได้ส่งอีเมลมาให้ โปรดเพิ่มอีเมลเพื่อดำเนินการต่อ',
  'gift.arrived': 'คุณได้รับของขวัญ',
  'gift.welcomeTitle': 'ของขวัญต้อนรับ',
  'gift.intro': 'หนึ่งในรางวัลเหล่านี้เป็นของคุณ เลือกได้เลย',
  'gift.newPlayerReward': 'รางวัลสำหรับผู้เล่นใหม่',
  'gift.specialReward': 'รางวัลพิเศษ',
  'gift.welcomeMessage':
    'ขอบคุณมากที่ร่วมเล่น 1.6 Competitive เวอร์ชันอัลฟ่าช่วงแรก! เพื่อเป็นของขวัญต้อนรับ โปรดเลือกหนึ่งรางวัลด้านล่าง',
  'gift.choose': 'เลือกรางวัลนี้',
  'gift.skinReward': 'สกินอาวุธแบบกำหนดเอง',
  'gift.currencyReward': 'รางวัลสกุลเงินจะถูกเพิ่มเข้าบัญชีของคุณโดยตรง',
  'gift.owned': 'มีอยู่แล้ว',
  'gift.claiming': 'กำลังรับ…',
  'gift.unlocked': 'ปลดล็อกแล้ว',
  'gift.yours': 'เป็นของคุณแล้ว',
  'gift.previewUnavailable': 'ไม่มีตัวอย่าง',
  'gift.decideLater': 'ฉันยังตัดสินใจไม่ได้',
  'matchmaking.playWindow':
    '+{{points}} แต้มต่อแมตช์ที่เข้าเงื่อนไขและเล่นจบ · {{start}}–{{end}} ({{timeZone}})',
  'matchmaking.playWindowReward': 'โบนัสช่วงเวลาเล่น',
  'matchmaking.playWindowActive': 'โบนัสเปิดใช้อยู่ตอนนี้',
  'matchmaking.playWindowInactive': 'อยู่นอกช่วงเวลาโบนัส',
  'matchmaking.playWindowUnavailable': 'ไม่พบเวลาโบนัส',
  'matchmaking.playWindowEarned': 'ได้รับโบนัส +{{points}} แต้ม',
  'matchmaking.playWindowNotEarned': 'แมตช์นี้ไม่ได้รับโบนัสช่วงเวลาเล่น',
  'matchmaking.playWindowResultUnavailable': 'ไม่สามารถแสดงผลโบนัสได้',
  'matchmaking.preferHumans': 'ให้ความสำคัญกับผู้เล่นจริง',
  'matchmaking.modeHelp5v5': '5v5 แบบจัดอันดับ มีการเปลี่ยนแปลง MMR ทีมที่ชนะ 13 รอบก่อนเป็นผู้ชนะ',
  'matchmaking.modeHelpUnrated':
    '5v5 ไม่จัดอันดับ ทีมที่ชนะ 9 รอบก่อนเป็นผู้ชนะ และ MMR ไม่เปลี่ยน',
  'matchmaking.modeHelpLegacy':
    '5v5 ไม่จัดอันดับพร้อมการเคลื่อนไหวแบบ CS 1.3 ทีมที่ชนะ 9 รอบก่อนเป็นผู้ชนะ',
  'matchmaking.modeHelpFfa': 'เดธแมตช์ทุกคนสู้กันเอง ผู้เล่นที่ได้ 50 คิลก่อนเป็นผู้ชนะ',
  'matchmaking.modeHelpFightYard': 'Fight Yard แบบทีม ทีมที่ได้ 90 คิลก่อนเป็นผู้ชนะ',
  'matchmaking.modeHelp3v3': '3v3 ไม่จัดอันดับ ทีมที่ชนะ 13 รอบก่อนเป็นผู้ชนะ',
  'matchmaking.preferHumansTooltip':
    'ให้ความสำคัญกับผู้เล่นจริงและชะลอการเติมบอทอัตโนมัติ บอทอาจเข้าร่วมได้หากผู้เล่นอื่นยินยอมหรือโหมดอนุญาต',
  'matchmaking.playWindowTooltip':
    'โบนัสขึ้นอยู่กับโหนดที่จัดแมตช์เมื่อเริ่มเกม ต้องเชื่อมต่อและเล่นแมตช์จับคู่ที่มีแต่ผู้เล่นจริงจนจบภายในเวลาที่ประกาศไว้ เกมแบบกำหนดเองและแมตช์ที่มีบอตไม่เข้าเกณฑ์'
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
  'settings.usernameCooldown': 'Anda dapat mengubah nama pengguna lagi pada {{date}}.',
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
    'Facebook tidak memberikan alamat email. Tambahkan email untuk melanjutkan.',
  'gift.arrived': 'Hadiah telah tiba',
  'gift.welcomeTitle': 'HADIAH SELAMAT DATANG',
  'gift.intro': 'Salah satu hadiah ini milikmu. Silakan pilih.',
  'gift.newPlayerReward': 'Hadiah pemain baru',
  'gift.specialReward': 'Hadiah spesial',
  'gift.welcomeMessage':
    'Terima kasih banyak telah memainkan rilis early alpha 1.6 Competitive! Sebagai hadiah selamat datang, silakan pilih salah satu hadiah di bawah ini.',
  'gift.choose': 'Pilih hadiah ini',
  'gift.skinReward': 'Skin senjata khusus.',
  'gift.currencyReward': 'Hadiah mata uang akan langsung ditambahkan ke akunmu.',
  'gift.owned': 'Sudah dimiliki',
  'gift.claiming': 'Mengklaim…',
  'gift.unlocked': 'Terbuka',
  'gift.yours': 'Milikmu',
  'gift.previewUnavailable': 'Pratinjau tidak tersedia',
  'gift.decideLater': 'Saya belum bisa memutuskan',
  'matchmaking.playWindow':
    '+{{points}} poin per pertandingan selesai yang memenuhi syarat · {{start}}–{{end}} ({{timeZone}})',
  'matchmaking.playWindowReward': 'Bonus waktu bermain',
  'matchmaking.playWindowActive': 'Bonus aktif sekarang',
  'matchmaking.playWindowInactive': 'Di luar jam bonus',
  'matchmaking.playWindowUnavailable': 'Jam bonus tidak tersedia',
  'matchmaking.playWindowEarned': 'Mendapat +{{points}} poin bonus',
  'matchmaking.playWindowNotEarned': 'Tidak ada bonus waktu bermain untuk pertandingan ini',
  'matchmaking.playWindowResultUnavailable': 'Hasil bonus tidak tersedia',
  'matchmaking.preferHumans': 'Utamakan pemain manusia',
  'matchmaking.modeHelp5v5':
    '5v5 berperingkat dengan perubahan MMR. Tim pertama yang menang 13 ronde menjadi pemenang.',
  'matchmaking.modeHelpUnrated':
    '5v5 tanpa peringkat. Tim pertama yang menang 9 ronde menjadi pemenang; MMR tidak berubah.',
  'matchmaking.modeHelpLegacy':
    '5v5 tanpa peringkat dengan gerakan CS 1.3. Tim pertama yang menang 9 ronde menjadi pemenang.',
  'matchmaking.modeHelpFfa': 'Deathmatch semua lawan semua. Pemain pertama dengan 50 kill menang.',
  'matchmaking.modeHelpFightYard': 'Fight Yard beregu. Tim pertama dengan 90 kill menang.',
  'matchmaking.modeHelp3v3':
    '3v3 tanpa peringkat. Tim pertama yang menang 13 ronde menjadi pemenang.',
  'matchmaking.preferHumansTooltip':
    'Mengutamakan pemain manusia dan menunda pengisian bot otomatis. Bot tetap bisa bergabung jika pemain lain setuju atau mode mengizinkannya.',
  'matchmaking.playWindowTooltip':
    'Node pertandingan yang ditetapkan menentukan bonus saat pertandingan dimulai. Terhubung dan selesaikan pertandingan matchmaking berisi pemain manusia saja selama jam yang diumumkan. Game khusus dan pertandingan dengan bot tidak memenuhi syarat.'
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
  'settings.usernameCooldown': 'Você pode alterar seu nome de usuário novamente em {{date}}.',
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
    'O Facebook não forneceu um endereço de e-mail. Adicione um para continuar.',
  'gift.arrived': 'Um presente chegou',
  'gift.welcomeTitle': 'PRESENTE DE BOAS-VINDAS',
  'gift.intro': 'Uma destas recompensas é sua. Escolha com cuidado.',
  'gift.newPlayerReward': 'Recompensa de novo jogador',
  'gift.specialReward': 'Recompensa especial',
  'gift.welcomeMessage':
    'Agradecemos muito por jogar a versão early alpha de 1.6 Competitive! Como presente de boas-vindas, escolha uma das recompensas abaixo.',
  'gift.choose': 'Escolher esta recompensa',
  'gift.skinReward': 'Skin de arma personalizada.',
  'gift.currencyReward': 'A recompensa em moeda será adicionada diretamente à sua conta.',
  'gift.owned': 'Já possui',
  'gift.claiming': 'Resgatando…',
  'gift.unlocked': 'Desbloqueada',
  'gift.yours': 'É sua',
  'gift.previewUnavailable': 'Prévia indisponível',
  'gift.decideLater': 'Ainda não consigo decidir',
  'matchmaking.playWindow':
    '+{{points}} pontos por partida elegível concluída · {{start}}–{{end}} ({{timeZone}})',
  'matchmaking.playWindowReward': 'Bônus da janela de jogo',
  'matchmaking.playWindowActive': 'Bônus ativo agora',
  'matchmaking.playWindowInactive': 'Fora do horário de bônus',
  'matchmaking.playWindowUnavailable': 'Horário de bônus indisponível',
  'matchmaking.playWindowEarned': '+{{points}} pontos de bônus recebidos',
  'matchmaking.playWindowNotEarned': 'Sem bônus de horário nesta partida',
  'matchmaking.playWindowResultUnavailable': 'Resultado do bônus indisponível',
  'matchmaking.preferHumans': 'Preferir pessoas',
  'matchmaking.modeHelp5v5':
    '5v5 ranqueado com progressão de MMR. Vence a primeira equipe a ganhar 13 rodadas.',
  'matchmaking.modeHelpUnrated':
    '5v5 sem ranking. Vence a primeira equipe a ganhar 9 rodadas; o MMR não muda.',
  'matchmaking.modeHelpLegacy':
    '5v5 sem ranking com movimentação de CS 1.3. Vence a primeira equipe a ganhar 9 rodadas.',
  'matchmaking.modeHelpFfa':
    'Mata-mata todos contra todos. Vence o primeiro jogador a conseguir 50 abates.',
  'matchmaking.modeHelpFightYard':
    'Fight Yard em equipes. Vence a primeira equipe a conseguir 90 abates.',
  'matchmaking.modeHelp3v3': '3v3 sem ranking. Vence a primeira equipe a ganhar 13 rodadas.',
  'matchmaking.preferHumansTooltip':
    'Prioriza jogadores humanos e atrasa o preenchimento automático com bots. Bots ainda podem entrar se outro jogador aceitar ou o modo permitir.',
  'matchmaking.playWindowTooltip':
    'O nó atribuído à partida determina o bônus quando ela começa. Conecte-se e conclua uma partida de matchmaking só com jogadores humanos durante o horário publicado. Jogos personalizados e partidas com bots não são elegíveis.'
}

const japanese: Record<TranslationKey, string> = {
  'nav.lobbyNavigation': 'ロビー ナビゲーション',
  'nav.home': 'ホーム',
  'nav.settings': '設定',
  'nav.inventory': 'インベントリ',
  'nav.leaderboard': 'ランキング',
  'nav.play': 'プレイ',
  'nav.store': 'ストア',
  'nav.news': 'ニュース',
  'settings.language.title': '言語',
  'settings.language.description': 'ランチャーの表示言語を選択してください。',
  'settings.language.help': '変更はすぐに反映され、このデバイスに保存されます。',
  'settings.usernameCooldown': '{{date}}にユーザー名を再度変更できます。',
  'auth.restoring': 'セッションを復元しています',
  'auth.welcomeBack': 'おかえりなさい',
  'auth.createAccount': 'アカウントを作成',
  'auth.loginDescription': 'マッチメイキングを続けるにはサインインしてください。',
  'auth.registerDescription': 'アカウントの作成方法を選択してください。',
  'auth.login': 'ログイン',
  'auth.register': '登録',
  'auth.or': 'または',
  'auth.username': 'ユーザー名',
  'auth.usernameHint': '3～32文字：英字、数字、アンダースコア',
  'auth.email': 'メールアドレス',
  'auth.password': 'パスワード',
  'auth.passwordPlaceholder': '8文字以上',
  'auth.signingIn': 'サインイン中…',
  'auth.signIn': 'サインイン',
  'auth.createAccountButton': 'アカウントを作成',
  'auth.continueFacebook': 'Facebookで続行',
  'auth.exitDesktop': 'デスクトップに戻る',
  'auth.privacyPolicy': 'プライバシーポリシー',
  'auth.terms': '利用規約',
  'auth.finishSocial': 'ブラウザーで{{provider}}を使って{{action}}を完了してください。',
  'auth.finishSigningIn': 'サインイン',
  'auth.finishCreatingAccount': 'アカウントの作成',
  'auth.facebookEmailHint':
    'Facebookからメールアドレスを取得できませんでした。続行するには追加してください。',
  'gift.arrived': 'ギフトが届きました',
  'gift.welcomeTitle': 'ウェルカムギフト',
  'gift.intro': '報酬を1つ選べます。慎重に選びましょう。',
  'gift.newPlayerReward': '新規プレイヤー報酬',
  'gift.specialReward': '特別報酬',
  'gift.welcomeMessage':
    '1.6 Competitiveの早期アルファ版をプレイしていただきありがとうございます！ウェルカムギフトとして、以下から報酬を1つ選んでください。',
  'gift.choose': 'この報酬を選ぶ',
  'gift.skinReward': 'カスタム武器スキン。',
  'gift.currencyReward': '通貨報酬はアカウントに直接追加されます。',
  'gift.owned': '所持済み',
  'gift.claiming': '受け取り中',
  'gift.unlocked': '解除済み',
  'gift.yours': 'あなたのもの',
  'gift.previewUnavailable': 'プレビューを利用できません',
  'gift.decideLater': 'あとで決める',
  'matchmaking.playWindow':
    '完了した対象試合ごとに+{{points}}ポイント · {{start}}–{{end}} ({{timeZone}})',
  'matchmaking.playWindowReward': 'プレイ時間ボーナス',
  'matchmaking.playWindowActive': '現在ボーナス有効',
  'matchmaking.playWindowInactive': 'ボーナス時間外',
  'matchmaking.playWindowUnavailable': 'ボーナス時間を取得できません',
  'matchmaking.playWindowEarned': 'ボーナスポイント +{{points}} を獲得',
  'matchmaking.playWindowNotEarned': 'この試合の時間帯ボーナスなし',
  'matchmaking.playWindowResultUnavailable': 'ボーナス結果を取得できません',
  'matchmaking.preferHumans': '人間のプレイヤーを優先',
  'matchmaking.modeHelp5v5': 'MMRが変動するランク戦5v5。先に13ラウンドを取ったチームが勝利。',
  'matchmaking.modeHelpUnrated':
    '非ランク戦5v5。先に9ラウンドを取ったチームが勝利し、MMRは変動しません。',
  'matchmaking.modeHelpLegacy':
    'CS 1.3の移動仕様を使う非ランク戦5v5。先に9ラウンドを取ったチームが勝利。',
  'matchmaking.modeHelpFfa': '全員敵のデスマッチ。先に50キルしたプレイヤーが勝利。',
  'matchmaking.modeHelpFightYard': 'チーム戦のFight Yard。先に90キルしたチームが勝利。',
  'matchmaking.modeHelp3v3': '非ランク戦3v3。先に13ラウンドを取ったチームが勝利。',
  'matchmaking.preferHumansTooltip':
    '人間のプレイヤーを優先し、自動のボット補充を遅らせます。他のプレイヤーが同意するか、モードが許可する場合はボットが参加することもあります。',
  'matchmaking.playWindowTooltip':
    'ボーナスは試合開始時に割り当てられたノードで決まります。公開時間内に接続し、人間のみのマッチメイキング試合を完了してください。カスタムゲームとボット入りの試合は対象外です。'
}

const hindi: Record<TranslationKey, string> = {
  'nav.lobbyNavigation': 'लॉबी नेविगेशन',
  'nav.home': 'होम',
  'nav.settings': 'सेटिंग्स',
  'nav.inventory': 'इन्वेंटरी',
  'nav.leaderboard': 'लीडरबोर्ड',
  'nav.play': 'खेलें',
  'nav.store': 'स्टोर',
  'nav.news': 'समाचार',
  'settings.language.title': 'भाषा',
  'settings.language.description': 'लॉन्चर इंटरफ़ेस की भाषा चुनें।',
  'settings.language.help': 'बदलाव तुरंत लागू होते हैं और इस डिवाइस पर सहेजे जाते हैं।',
  'settings.usernameCooldown': 'आप {{date}} को अपना उपयोगकर्ता नाम फिर बदल सकते हैं।',
  'auth.restoring': 'आपका सत्र बहाल हो रहा है',
  'auth.welcomeBack': 'वापसी पर स्वागत है',
  'auth.createAccount': 'खाता बनाएँ',
  'auth.loginDescription': 'मैचमेकिंग जारी रखने के लिए साइन इन करें।',
  'auth.registerDescription': 'खाता बनाने का तरीका चुनें।',
  'auth.login': 'लॉग इन',
  'auth.register': 'पंजीकरण',
  'auth.or': 'या',
  'auth.username': 'उपयोगकर्ता नाम',
  'auth.usernameHint': '3–32 अक्षर: अंग्रेज़ी अक्षर, अंक और अंडरस्कोर',
  'auth.email': 'ईमेल',
  'auth.password': 'पासवर्ड',
  'auth.passwordPlaceholder': 'कम से कम 8 अक्षर',
  'auth.signingIn': 'साइन इन हो रहा है…',
  'auth.signIn': 'साइन इन करें',
  'auth.createAccountButton': 'खाता बनाएँ',
  'auth.continueFacebook': 'Facebook से जारी रखें',
  'auth.exitDesktop': 'डेस्कटॉप पर जाएँ',
  'auth.privacyPolicy': 'गोपनीयता नीति',
  'auth.terms': 'नियम और शर्तें',
  'auth.finishSocial': 'अपने ब्राउज़र में {{provider}} से {{action}} पूरा करें।',
  'auth.finishSigningIn': 'साइन इन',
  'auth.finishCreatingAccount': 'खाता बनाना',
  'auth.facebookEmailHint': 'Facebook से ईमेल पता नहीं मिला। जारी रखने के लिए ईमेल जोड़ें।',
  'gift.arrived': 'आपको उपहार मिला है',
  'gift.welcomeTitle': 'स्वागत उपहार',
  'gift.intro': 'इनमें से एक इनाम आपका है। सोच-समझकर चुनें।',
  'gift.newPlayerReward': 'नए खिलाड़ी का इनाम',
  'gift.specialReward': 'विशेष इनाम',
  'gift.welcomeMessage':
    '1.6 Competitive का शुरुआती अल्फ़ा संस्करण खेलने के लिए धन्यवाद! स्वागत उपहार के रूप में नीचे दिए गए इनामों में से एक चुनें।',
  'gift.choose': 'यह इनाम चुनें',
  'gift.skinReward': 'कस्टम हथियार स्किन।',
  'gift.currencyReward': 'मुद्रा इनाम सीधे आपके खाते में जोड़ दिया जाएगा।',
  'gift.owned': 'पहले से मौजूद',
  'gift.claiming': 'प्राप्त किया जा रहा है…',
  'gift.unlocked': 'अनलॉक हो गया',
  'gift.yours': 'आपका है',
  'gift.previewUnavailable': 'पूर्वावलोकन उपलब्ध नहीं है',
  'gift.decideLater': 'मैं बाद में चुनूँगा',
  'matchmaking.playWindow':
    'हर पात्र पूरे मैच पर +{{points}} अंक · {{start}}–{{end}} ({{timeZone}})',
  'matchmaking.playWindowReward': 'खेल समय बोनस',
  'matchmaking.playWindowActive': 'बोनस अभी सक्रिय है',
  'matchmaking.playWindowInactive': 'बोनस समय के बाहर',
  'matchmaking.playWindowUnavailable': 'बोनस समय उपलब्ध नहीं है',
  'matchmaking.playWindowEarned': '+{{points}} बोनस अंक मिले',
  'matchmaking.playWindowNotEarned': 'इस मैच में खेल समय बोनस नहीं मिला',
  'matchmaking.playWindowResultUnavailable': 'बोनस परिणाम उपलब्ध नहीं है',
  'matchmaking.preferHumans': 'मानव खिलाड़ियों को प्राथमिकता दें',
  'matchmaking.modeHelp5v5':
    'MMR प्रगति के साथ रैंक वाला 5v5। पहले 13 राउंड जीतने वाली टीम विजेता होगी।',
  'matchmaking.modeHelpUnrated':
    'बिना रैंक वाला 5v5। पहले 9 राउंड जीतने वाली टीम विजेता होगी; MMR नहीं बदलेगा।',
  'matchmaking.modeHelpLegacy':
    'CS 1.3 मूवमेंट के साथ बिना रैंक वाला 5v5। पहले 9 राउंड जीतने वाली टीम विजेता होगी।',
  'matchmaking.modeHelpFfa': 'हर खिलाड़ी अपने लिए डेथमैच। पहले 50 किल करने वाला खिलाड़ी जीतेगा।',
  'matchmaking.modeHelpFightYard': 'टीम Fight Yard। पहले 90 किल करने वाली टीम जीतेगी।',
  'matchmaking.modeHelp3v3': 'बिना रैंक वाला 3v3। पहले 13 राउंड जीतने वाली टीम विजेता होगी।',
  'matchmaking.preferHumansTooltip':
    'मानव खिलाड़ियों को प्राथमिकता देता है और अपने आप बॉट जोड़ने में देरी करता है। कोई दूसरा खिलाड़ी सहमति दे या मोड अनुमति दे तो बॉट फिर भी आ सकते हैं।',
  'matchmaking.playWindowTooltip':
    'मैच शुरू होने पर चुना गया नोड बोनस तय करता है। उसके घोषित समय में केवल असली खिलाड़ियों वाला मैचमेकिंग मैच कनेक्ट होकर पूरा करें। कस्टम गेम और बॉट वाले मैच पात्र नहीं हैं।'
}

const translations: Record<SupportedLanguageCode, Record<TranslationKey, string>> = {
  en: english,
  ru: russian,
  tl: taglish,
  th: thai,
  id: indonesian,
  hi: hindi,
  pt: portuguese,
  ja: japanese
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
