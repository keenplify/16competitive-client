import {
  CheckCircle2,
  Download,
  FolderOpen,
  Gamepad2,
  Gift,
  LoaderCircle,
  Settings2,
  ShieldCheck
} from 'lucide-react'
import { useEffect, useState, type JSX } from 'react'
import { Button } from '../../components/ui/Button'
import { ChoiceCard } from '../../components/ui/ChoiceCard'
import { SetupCard } from '../../components/ui/SetupCard'
import { TextField } from '../../components/ui/TextField'
import { useAuthStore } from '../auth/auth.store'
import { useNavigationStore } from '../navigation/navigation.store'
import { useGameSettingsStore } from './game-settings.store'
import { useOnboardingStore } from './onboarding.store'
import { useReferralStore } from './referral.store'

const clientLabel = {
  steam: 'Steam CS 1.6',
  nextclient: 'NextClient for CS 1.6',
  standalone: 'Standalone CS 1.6'
} as const

export function OnboardingPage(): JSX.Element {
  const step = useOnboardingStore((state) => state.step)
  const mode = useOnboardingStore((state) => state.mode)
  const setStep = useOnboardingStore((state) => state.setStep)
  const setMode = useOnboardingStore((state) => state.setMode)
  const completionPhase = useOnboardingStore((state) => state.completionPhase)
  const beginFinish = useOnboardingStore((state) => state.beginFinish)
  const finishFailed = useOnboardingStore((state) => state.finishFailed)
  const finishSucceeded = useOnboardingStore((state) => state.finishSucceeded)
  const resetOnboarding = useOnboardingStore((state) => state.reset)
  const playerId = useAuthStore((state) => state.session?.player.id)
  const refreshSession = useAuthStore((state) => state.refreshSession)
  const navigate = useNavigationStore((state) => state.navigate)
  const referralPlayerId = useReferralStore((state) => state.playerId)
  const referralStatus = useReferralStore((state) => state.status)
  const referralClaimed = useReferralStore((state) => state.claimed)
  const referralError = useReferralStore((state) => state.error)
  const loadReferral = useReferralStore((state) => state.load)
  const claimReferral = useReferralStore((state) => state.claim)
  const [referralInput, setReferralInput] = useState('')
  const savedPath = useGameSettingsStore((state) => state.savedPath)
  const clientType = useGameSettingsStore((state) => state.clientType)
  const platform = useGameSettingsStore((state) => state.platform)
  const status = useGameSettingsStore((state) => state.status)
  const error = useGameSettingsStore((state) => state.error)
  const choose = useGameSettingsStore((state) => state.choose)
  const load = useGameSettingsStore((state) => state.load)
  const completeSetup = useGameSettingsStore((state) => state.completeSetup)
  const busy = status !== 'idle' || completionPhase === 'finishing'
  const referralBusy = referralStatus === 'loading' || referralStatus === 'claiming'
  const referralChecking =
    !!playerId &&
    (referralPlayerId !== playerId || referralStatus === 'idle' || referralStatus === 'loading')
  const referralAlreadyUsed =
    referralPlayerId === playerId && referralStatus === 'ready' && referralClaimed

  useEffect(() => {
    resetOnboarding()
  }, [playerId, resetOnboarding])

  useEffect(() => {
    if (!playerId) return
    if (referralPlayerId !== playerId || referralStatus === 'idle') void loadReferral(playerId)
  }, [loadReferral, playerId, referralPlayerId, referralStatus])

  useEffect(() => {
    if (step === 'referral' && referralAlreadyUsed) setStep('review')
  }, [referralAlreadyUsed, setStep, step])

  const titles = {
    installation: 'Set up Counter-Strike',
    preferences: 'Make it yours',
    referral: 'Have a referral code?',
    review: 'Ready to play'
  }
  const descriptions = {
    installation: 'Choose the Counter-Strike 1.6 installation this launcher will use for matches.',
    preferences:
      'Choose how much of the 1.6 Competitive experience to enable. You can change features later in Settings.',
    referral:
      'If a friend invited you, enter their code once. You both receive rewards. You can also skip this step.',
    review: 'Review your choices, then enter the launcher.'
  }

  const finish = async (): Promise<void> => {
    beginFinish()
    if (await completeSetup(mode)) {
      navigate('lobby')
      finishSucceeded()
    } else {
      finishFailed()
    }
  }

  const applyReferral = async (): Promise<void> => {
    if (await claimReferral(referralInput.trim().toUpperCase())) {
      void refreshSession()
      setStep('review')
    }
  }

  const stepNumber =
    step === 'installation' ? 1 : step === 'preferences' ? 2 : step === 'referral' ? 3 : 4

  return (
    <SetupCard
      eyebrow={`Client setup · ${stepNumber} of 4`}
      title={completionPhase === 'success' ? "You're all set" : titles[step]}
      description={
        completionPhase === 'success'
          ? 'Your setup is saved. Entering the launcher now.'
          : descriptions[step]
      }
      className="max-w-xl"
      contentKey={completionPhase === 'success' ? 'success' : step}
      footer={
        <p className="text-center text-xs leading-5 text-neutral-500">
          Your personal Counter-Strike settings stay yours.
        </p>
      }
    >
      <div className="mb-7 flex gap-2" aria-label={`Setup progress: step ${stepNumber} of 4`}>
        {(['installation', 'preferences', 'referral', 'review'] as const).map((item, index) => (
          <span
            key={item}
            className={`setup-progress h-1 flex-1 ${index < stepNumber ? 'setup-progress-active bg-sky-400' : 'bg-white/10'}`}
          />
        ))}
      </div>

      {completionPhase === 'success' ? (
        <div className="setup-success grid min-h-80 place-items-center text-center" role="status">
          <div>
            <span className="mx-auto grid size-20 place-items-center rounded-full border border-emerald-300/40 bg-emerald-400/10 text-emerald-300">
              <CheckCircle2 className="size-10" aria-hidden="true" />
            </span>
            <p className="mt-5 text-sm text-neutral-300">Preparing your lobby…</p>
          </div>
        </div>
      ) : (
        <>
          <div key={step} className="setup-step-enter min-h-80">
            {step === 'installation' && (
              <div className="space-y-4">
                <div className="border border-white/10 bg-white/3 p-4">
                  <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center bg-sky-400/10 text-sky-300">
                      <Gamepad2 className="size-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white">
                        {clientType ? clientLabel[clientType] : 'No installation selected'}
                      </p>
                      <p className="mt-1 break-all text-xs leading-5 text-neutral-400">
                        {savedPath ??
                          'Steam CS 1.6 is recommended. Select the folder containing your game.'}
                      </p>
                    </div>
                    {savedPath && (
                      <CheckCircle2
                        className="size-5 shrink-0 text-emerald-300"
                        aria-label="Installation found"
                      />
                    )}
                  </div>
                </div>

                <Button
                  variant="secondary"
                  className="w-full gap-2"
                  disabled={busy}
                  onClick={() => void choose()}
                >
                  {busy ? (
                    <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <FolderOpen className="size-4" aria-hidden="true" />
                  )}
                  {savedPath ? 'Choose a different installation' : 'Choose installation folder'}
                </Button>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="border border-white/10 bg-white/2 p-4">
                    <p className="text-sm font-semibold">
                      Steam CS 1.6{' '}
                      <span className="ml-1 text-[10px] font-bold tracking-wide text-sky-300 uppercase">
                        Recommended
                      </span>
                    </p>
                    <p className="mt-1 text-xs leading-5 text-neutral-400">
                      Own the game on Steam, then select its Half-Life folder.
                    </p>
                    <Button
                      variant="ghost"
                      className="mt-3 h-8 gap-2 px-0 text-sky-300"
                      onClick={() => void window.api.window.openCounterStrikeSteamStore()}
                    >
                      <Download className="size-4" aria-hidden="true" /> Open Steam store
                    </Button>
                  </div>
                  {platform === 'win32' && (
                    <div className="border border-white/10 bg-white/2 p-4">
                      <p className="text-sm font-semibold">
                        NextClient{' '}
                        <span className="ml-1 text-[10px] font-bold tracking-wide text-neutral-400 uppercase">
                          Windows only
                        </span>
                      </p>
                      <p className="mt-1 text-xs leading-5 text-neutral-400">
                        Already have NextClient for CS 1.6? Select its installation folder above.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {step === 'preferences' && (
              <div className="space-y-3">
                <ChoiceCard
                  title="Recommended Setup"
                  badge="Recommended"
                  description="Enable the competitive HUD, cosmetics, kill cards, and fast weapon switching. Personal settings stay untouched."
                  icon={<ShieldCheck className="size-5" aria-hidden="true" />}
                  selected={mode === 'recommended'}
                  onClick={() => setMode('recommended')}
                />
                <ChoiceCard
                  title="Custom Setup"
                  description="Keep optional launcher features off for now. Enable them individually in Settings when you want them."
                  icon={<Settings2 className="size-5" aria-hidden="true" />}
                  selected={mode === 'custom'}
                  onClick={() => setMode('custom')}
                />
              </div>
            )}

            {step === 'referral' && (
              <div className="space-y-5">
                <div className="flex items-start gap-3 border border-sky-400/20 bg-sky-400/5 p-4">
                  <span className="grid size-10 shrink-0 place-items-center bg-sky-400/10 text-sky-300">
                    <Gift className="size-5" aria-hidden="true" />
                  </span>
                  <p className="text-sm leading-6 text-neutral-300">
                    Invite friends later using your own code in Settings.
                  </p>
                </div>
                {referralClaimed ? (
                  <div className="flex items-center gap-3 border border-emerald-300/25 bg-emerald-400/5 p-4 text-sm text-emerald-300">
                    <CheckCircle2 className="size-5" aria-hidden="true" /> Referral code already
                    used on this account.
                  </div>
                ) : (
                  <TextField
                    id="onboarding-referral-code"
                    label="Referral code (optional)"
                    value={referralInput}
                    maxLength={14}
                    autoComplete="off"
                    placeholder="R-XXXXXXXXXXXX"
                    disabled={referralStatus === 'loading' || referralStatus === 'claiming'}
                    onChange={(event) => setReferralInput(event.target.value.toUpperCase())}
                  />
                )}
              </div>
            )}

            {step === 'review' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3 border border-white/10 bg-white/3 p-4">
                  <span className="text-sm text-neutral-400">Game client</span>
                  <span className="text-right text-sm font-semibold">
                    {clientType ? clientLabel[clientType] : 'No installation'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 border border-white/10 bg-white/3 p-4">
                  <span className="text-sm text-neutral-400">Setup preference</span>
                  <span className="text-right text-sm font-semibold">
                    {mode === 'recommended' ? 'Recommended Setup' : 'Custom Setup'}
                  </span>
                </div>
                <p className="px-1 text-xs leading-5 text-neutral-400">
                  Required match files are checked before each game launches. You can change the
                  installation and features in Settings later.
                </p>
              </div>
            )}
          </div>

          <div
            className="mt-6 flex h-12 items-start gap-2 overflow-y-auto text-sm"
            aria-live="polite"
          >
            {(step === 'referral' ? referralError : error) ? (
              <p className="text-red-400">{step === 'referral' ? referralError : error}</p>
            ) : status === 'loading' ? (
              <p className="flex items-center gap-2 text-sky-300">
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> Detecting
                Counter-Strike…
              </p>
            ) : status === 'choosing' ? (
              <p className="flex items-center gap-2 text-sky-300">
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> Waiting for a
                folder…
              </p>
            ) : status === 'saving' || completionPhase === 'finishing' ? (
              <p className="flex items-center gap-2 text-sky-300">
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />{' '}
                {step === 'review' ? 'Saving your setup…' : 'Checking installation…'}
              </p>
            ) : (referralBusy && step === 'referral') ||
              (referralChecking && step === 'preferences') ? (
              <p className="flex items-center gap-2 text-sky-300">
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />{' '}
                {referralStatus === 'claiming'
                  ? 'Applying referral code…'
                  : 'Checking referral status…'}
              </p>
            ) : step === 'installation' && savedPath ? (
              <p className="flex items-center gap-2 text-emerald-300">
                <CheckCircle2 className="size-4" aria-hidden="true" /> Installation selected
              </p>
            ) : null}
          </div>

          <div className="mt-3 flex gap-3">
            {step !== 'installation' && (
              <Button
                variant="ghost"
                className="w-28 border border-white/10"
                disabled={busy || referralBusy}
                onClick={() =>
                  setStep(
                    step === 'review'
                      ? referralAlreadyUsed
                        ? 'preferences'
                        : 'referral'
                      : step === 'referral'
                        ? 'preferences'
                        : 'installation'
                  )
                }
              >
                Back
              </Button>
            )}
            {step === 'installation' ? (
              <Button
                className="w-full bg-sky-400 hover:bg-sky-300"
                disabled={!savedPath || busy}
                onClick={() => setStep('preferences')}
              >
                Continue
              </Button>
            ) : step === 'preferences' ? (
              <Button
                className="flex-1 gap-2 bg-sky-400 hover:bg-sky-300"
                disabled={busy || referralChecking}
                onClick={() => setStep(referralAlreadyUsed ? 'review' : 'referral')}
              >
                {referralChecking ? (
                  <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <span className="size-4" aria-hidden="true" />
                )}
                Continue
              </Button>
            ) : step === 'referral' ? (
              <Button
                className="flex-1 gap-2 bg-sky-400 hover:bg-sky-300"
                disabled={busy || referralBusy}
                onClick={() =>
                  referralInput.trim() && !referralClaimed
                    ? void applyReferral()
                    : setStep('review')
                }
              >
                {referralStatus === 'claiming' ? (
                  <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <span className="size-4" aria-hidden="true" />
                )}
                {referralInput.trim() && !referralClaimed ? 'Apply code' : 'Continue'}
              </Button>
            ) : (
              <Button
                className="flex-1 gap-2 bg-sky-400 hover:bg-sky-300"
                disabled={busy || !savedPath}
                onClick={() => void finish()}
              >
                {busy ? (
                  <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <span className="size-4" aria-hidden="true" />
                )}
                Enter 1.6 Competitive
              </Button>
            )}
          </div>
          {step === 'installation' && !savedPath && (
            <Button
              variant="ghost"
              className="mt-3 w-full text-sky-300"
              disabled={busy}
              onClick={() => void load()}
            >
              Retry detection
            </Button>
          )}
          {step === 'referral' && !referralClaimed && (
            <Button
              variant="ghost"
              className="mt-3 w-full text-neutral-400"
              disabled={busy || referralBusy}
              onClick={() => setStep('review')}
            >
              Skip for now
            </Button>
          )}
        </>
      )}
    </SetupCard>
  )
}
