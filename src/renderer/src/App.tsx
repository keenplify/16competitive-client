import { AuthPage } from './features/auth/AuthPage'
import { ConnectionBanner } from './features/matchmaking/ConnectionBanner'
import { UpdateBanner } from './features/updates/UpdateBanner'
import { SkinAssetSyncIndicator } from './features/skins/SkinAssetSyncIndicator'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'

function App(): React.JSX.Element {
  return (
    <>
      <UpdateBanner />
      <ConnectionBanner />
      <SkinAssetSyncIndicator />
      <ToastContainer position="top-left" theme="dark" autoClose={3_500} />
      <AuthPage />
    </>
  )
}

export default App
