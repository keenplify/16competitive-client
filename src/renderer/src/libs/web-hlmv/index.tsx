import { createRoot } from 'react-dom/client'
import { App } from './ui/App'

// Render the app
const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Could not find the HLMV root element')
}

createRoot(rootElement).render(<App />)
