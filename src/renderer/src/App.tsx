import { AuthPage } from './features/auth/AuthPage'
import { AntiCheatStartupBanner } from './features/anticheat/AntiCheatStartupBanner'
import { DeviceBanGate } from './features/anticheat/DeviceBanGate'
import { AudioController } from './features/audio/AudioController'
import { AuthLanguageOverlay } from './features/i18n/AuthLanguageOverlay'
import { I18nRuntime } from './features/i18n/I18nRuntime'
import { ConnectionBanner } from './features/matchmaking/ConnectionBanner'
import { MatchAbandonNotice } from './features/matchmaking/MatchAbandonNotice'
import { UpdateBanner } from './features/updates/UpdateBanner'
import { SkinAssetSyncIndicator } from './features/skins/SkinAssetSyncIndicator'
import { VoiceChatDock } from './features/voice/VoiceChatDock'
import { Slide, ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import './assets/toast.css'

function App(): React.JSX.Element {
  return (
    <DeviceBanGate>
      <>
        <AntiCheatStartupBanner />
        <I18nRuntime />
        <AudioController />
        <UpdateBanner />
        <ConnectionBanner />
        <MatchAbandonNotice />
        <SkinAssetSyncIndicator />
        <VoiceChatDock />
        <AuthLanguageOverlay />
        <ToastContainer
          position="top-left"
          theme="dark"
          autoClose={3_500}
          style={{ marginTop: '4rem' }}
          transition={Slide}
          className="launcher-toast-container"
        />
        <AuthPage />
      </>
    </DeviceBanGate>
  )
}

export default App
