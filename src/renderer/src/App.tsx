import { AuthPage } from './features/auth/AuthPage'
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
    <>
      <UpdateBanner />
      <ConnectionBanner />
      <MatchAbandonNotice />
      <SkinAssetSyncIndicator />
      <VoiceChatDock />
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
  )
}

export default App
