import { AuthPage } from './features/auth/AuthPage'
import { ConnectionBanner } from './features/matchmaking/ConnectionBanner'
import { UpdateBanner } from './features/updates/UpdateBanner'
import { SkinAssetSyncIndicator } from './features/skins/SkinAssetSyncIndicator'

function App(): React.JSX.Element {
  return (
    <>
      <UpdateBanner />
      <ConnectionBanner />
      <SkinAssetSyncIndicator />
      <AuthPage />
    </>
  )
}

export default App
