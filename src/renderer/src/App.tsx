import { AuthPage } from './features/auth/AuthPage'
import { AudioController } from './features/audio/AudioController'
import { UpdateBanner } from './features/updates/UpdateBanner'

function App(): React.JSX.Element {
  return (
    <>
      <AudioController />
      <UpdateBanner />
      <AuthPage />
    </>
  )
}

export default App
