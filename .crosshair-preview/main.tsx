import React from 'react'
import {createRoot} from 'react-dom/client'
import '../src/renderer/src/assets/main.css'
import { CrosshairSettings } from '../src/renderer/src/features/settings/CrosshairSettings'
import {useGameSettingsStore} from '../src/renderer/src/features/settings/game-settings.store'
window.api = {gameSettings: {setCrosshair: async (crosshair) => {
 await new Promise(r => setTimeout(r, 400))
 if (window.previewError) throw new Error('Could not save crosshair.')
 return {crosshair}
}}}
useGameSettingsStore.setState({nextClientIntegrationEnabled:true})
createRoot(document.getElementById('root')).render(<main className="text-neutral-100" style={{maxWidth:1000,margin:'0 auto',padding:24}}><CrosshairSettings/></main>)
