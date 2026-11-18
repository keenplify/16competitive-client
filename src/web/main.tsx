import './partner-login-capture'
import '../renderer/src/features/i18n/detect-initial-language'

const duplicateMessage = {
  en: 'You can only open one instance of 1.6 Competitive at a time.',
  ru: 'Можно открыть только один экземпляр 1.6 Competitive.',
  tl: 'Isa lang ang puwedeng nakabukas na 1.6 Competitive sa bawat pagkakataon.',
  th: 'เปิด 1.6 Competitive ได้ครั้งละหนึ่งหน้าต่างเท่านั้น',
  id: 'Anda hanya dapat membuka satu 1.6 Competitive dalam satu waktu.',
  hi: 'आप एक समय में 1.6 Competitive की केवल एक विंडो खोल सकते हैं।',
  pt: 'Você só pode abrir uma instância do 1.6 Competitive por vez.',
  ja: '1.6 Competitive は同時に1つしか開けません。'
}

function showDuplicate(): void {
  const url = new URL(location.href)
  if (url.searchParams.has('handoff')) {
    url.searchParams.delete('handoff')
    history.replaceState(null, '', url)
  }
  let language = 'en'
  try {
    language = localStorage.getItem('16competitive.language') ?? language
  } catch {
    // Storage may be unavailable in private browsing.
  }
  document.documentElement.lang = language
  document.body.classList.add('duplicate-instance')
  const root = document.getElementById('root')!
  root.setAttribute('role', 'status')
  root.textContent =
    duplicateMessage[language as keyof typeof duplicateMessage] ?? duplicateMessage.en
}

if (navigator.locks) {
  void navigator.locks.request('16competitive-web-app', { ifAvailable: true }, async (lock) => {
    if (!lock) {
      showDuplicate()
      return
    }
    await import('./start-app')
    // The browser releases this lock when it destroys the owning document.
    await new Promise<void>(() => {})
  })
} else {
  void import('./start-app')
}
