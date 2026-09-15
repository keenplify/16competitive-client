import { useCallback } from 'react'
import { create } from 'zustand'

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ru', label: 'Русский' },
  { code: 'tl', label: 'Taglish' }
] as const

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code']

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
}

const translations: Record<LanguageCode, Record<TranslationKey, string>> = {
  en: english,
  ru: russian,
  tl: taglish
}

const STORAGE_KEY = '16competitive.language'

export const isLanguageCode = (value: unknown): value is LanguageCode =>
  SUPPORTED_LANGUAGES.some((language) => language.code === value)

const readStoredLanguage = (): LanguageCode => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return isLanguageCode(stored) ? stored : 'en'
  } catch {
    return 'en'
  }
}

const applyDocumentLanguage = (language: LanguageCode): void => {
  if (typeof document !== 'undefined') document.documentElement.lang = language
}

const persistLanguage = (language: LanguageCode): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, language)
  } catch {
    // Language preference is non-critical. Keep the in-memory value if storage is unavailable.
  }
}

interface LanguageState {
  language: LanguageCode
  setLanguage: (language: LanguageCode) => void
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
  language: LanguageCode,
  key: TranslationKey,
  params?: TranslationParams
): string => {
  let translated = translations[language][key] ?? english[key]
  if (!params) return translated

  for (const [name, value] of Object.entries(params)) {
    translated = translated.split(`{{${name}}}`).join(String(value))
  }
  return translated
}

export function useTranslation(): {
  language: LanguageCode
  t: (key: TranslationKey, params?: TranslationParams) => string
} {
  const language = useLanguageStore((state) => state.language)
  const t = useCallback(
    (key: TranslationKey, params?: TranslationParams) => translate(language, key, params),
    [language]
  )
  return { language, t }
}
