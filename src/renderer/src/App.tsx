import { AuthPage } from './features/auth/AuthPage'
import { UpdateBanner } from './features/updates/UpdateBanner'

function App(): React.JSX.Element {
  return (
    <>
      <UpdateBanner />
      <AuthPage />
    </>
  )
}

export default App
