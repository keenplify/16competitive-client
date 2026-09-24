import './browser-api'
import '../renderer/src/features/i18n/detect-initial-language'
import '../renderer/src/assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from '../renderer/src/App'
import { installDiagnosticLogCapture } from '../renderer/src/diagnostic-logs'

if ('serviceWorker' in navigator) {
  void navigator.serviceWorker.register('/pwa/sw.js').catch(() => undefined)
}

const mobileOrTablet =
  /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(navigator.userAgent) ||
  (window.matchMedia('(pointer: coarse)').matches && window.innerWidth < 1100)

if (mobileOrTablet) {
  document.documentElement.classList.add('web-mobile-gate')
} else {
  installDiagnosticLogCapture()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}
