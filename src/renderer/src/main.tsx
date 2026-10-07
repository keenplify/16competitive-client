import './features/i18n/detect-initial-language'
import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { RendererErrorBoundary } from './RendererErrorBoundary'
import { installDiagnosticLogCapture } from './diagnostic-logs'

installDiagnosticLogCapture()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RendererErrorBoundary>
      <App />
    </RendererErrorBoundary>
  </StrictMode>
)
