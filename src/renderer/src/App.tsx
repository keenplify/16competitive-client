import './features/settings/launcher-theme.store'
import { MatchDetailsOverlay } from './features/profile/MatchDetailsOverlay'
import { ProfileOverlay } from './features/profile/ProfileOverlay'
import { CommunityMembershipController } from './features/partner-branding/CommunityMembershipController'
import { MatchAssetPreparation } from './features/matchmaking/MatchAssetPreparation'
import { AuthPage } from './features/auth/AuthPage'
import { IcafeBranchPanel } from './features/auth/IcafeBranchPanel'
import { AntiCheatMatchCancellationNotice } from './features/anticheat/AntiCheatMatchCancellationNotice'
import { DeviceBanGate } from './features/anticheat/DeviceBanGate'
import { AudioController } from './features/audio/AudioController'
import { AuthLanguageOverlay } from './features/i18n/AuthLanguageOverlay'
import { ChatTranslationInitializer } from './features/settings/ChatTranslationInitializer'
import { I18nRuntime } from './features/i18n/I18nRuntime'
import { ConnectionBanner } from './features/matchmaking/ConnectionBanner'
import { MatchAbandonNotice } from './features/matchmaking/MatchAbandonNotice'
import { UpdateBanner } from './features/updates/UpdateBanner'
import { SkinAssetSyncIndicator } from './features/skins/SkinAssetSyncIndicator'
import { SkinGiftOverlay } from './features/skins/SkinGiftOverlay'
import { VoiceChatDock } from './features/voice/VoiceChatDock'
import { PartnerThemeController } from './features/partner-branding/PartnerThemeController'
import { PartnerSessionController } from './features/partner-branding/PartnerSessionController'
import { Slide, ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import './assets/toast.css'
import { useEffect } from 'react'
import { AlphaReleaseWatermark } from './components/AlphaReleaseWatermark'
import { WebHelperController } from './features/matchmaking/WebHelperController'
import { QueueWarmupNotice } from './features/matchmaking/QueueWarmupNotice'

function App(): React.JSX.Element {
  useEffect(() => {
    void window.api.updater
      .rendererReady()
      .catch((error: unknown) => console.warn('[Updater] Startup confirmation failed', error))
  }, [])
  return (
    <DeviceBanGate>
      <>
        <I18nRuntime />
        <PartnerThemeController />
        <CommunityMembershipController />
        <PartnerSessionController />
        <ChatTranslationInitializer />
        <AudioController />
        <UpdateBanner />
        <ConnectionBanner />
        <AntiCheatMatchCancellationNotice />
        <MatchAbandonNotice />
        <SkinAssetSyncIndicator />
        <MatchAssetPreparation />
        <QueueWarmupNotice />
        <WebHelperController />
        <AlphaReleaseWatermark />
        <SkinGiftOverlay />
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
        <ProfileOverlay />
        <MatchDetailsOverlay />
        <IcafeBranchPanel />
      </>
    </DeviceBanGate>
  )
}

export default App
