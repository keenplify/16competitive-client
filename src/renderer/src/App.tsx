import { AuthPage } from './features/auth/AuthPage'
import { ConnectionBanner } from './features/matchmaking/ConnectionBanner'
import { UpdateBanner } from './features/updates/UpdateBanner'

function App(): React.JSX.Element {
  return (
    <>
      <UpdateBanner />
      <ConnectionBanner />
      <AuthPage />
    </>
  )
}

export default App
