import { useEffect, type JSX } from 'react'
import { LoaderCircle } from 'lucide-react'
import { ModalDialog } from '../renderer/src/components/ui/ModalDialog'
import { Button } from '../renderer/src/components/ui/Button'
import { useAuthStore } from '../renderer/src/features/auth/auth.store'
import { usePartnerLoginStore } from './partner-login.store'
import { useTranslation } from '../renderer/src/features/i18n/i18n'

export function PartnerLoginController(): JSX.Element | null {
  const state = usePartnerLoginStore()
  const account = useAuthStore((s) => s.session?.player)
  const authStatus = useAuthStore((s) => s.status)
  const { t } = useTranslation()
  const initialize = state.initialize
  useEffect(() => {
    void initialize()
  }, [initialize])
  if (state.phase === 'idle' || state.phase === 'done') return null
  if (state.phase === 'waiting_login')
    return (
      <aside
        className="fixed bottom-6 left-6 z-[100001] max-w-md border border-white/20 bg-neutral-950 p-4 text-white"
        role="status"
      >
        <p className="text-sm">{t('partnerLogin.accountLink')}</p>
        <Button className="mt-3 w-full" onClick={state.resume}>
          {t('partnerLogin.resume')}
        </Button>
        <Button variant="ghost" className="mt-2 w-full" onClick={state.cancel}>
          {t('partnerLogin.cancel')}
        </Button>
      </aside>
    )
  const busy = state.phase === 'loading' || state.phase === 'submitting'
  const ready = state.phase === 'ready' && authStatus !== 'restoring' && authStatus !== 'submitting'
  return (
    <ModalDialog
      open
      labelledBy="partner-login-title"
      onClose={state.cancel}
      className="max-w-lg p-6"
      vguiTitlebar={false}
    >
      <h2 id="partner-login-title" className="text-2xl font-semibold">
        {t('partnerLogin.title')}
      </h2>
      <div className="mt-4 min-h-24 break-words text-sm text-neutral-200" role="status">
        {state.preview
          ? t('partnerLogin.description', {
              partner: state.preview.partnerName,
              username: state.preview.username
            })
          : t('partnerLogin.loading')}
        {state.preview?.email && <p className="mt-2 text-neutral-400">{state.preview.email}</p>}
      </div>
      <p className="min-h-16 text-sm text-neutral-300">
        {account ? t('partnerLogin.switch') : t('partnerLogin.linkHelp')}
      </p>
      <p className="min-h-16 text-sm text-rose-300" role="alert">
        {state.error ? t(`partnerLogin.${state.error}`) : ''}
      </p>
      <div className="grid gap-3">
        <Button disabled={!ready} onClick={() => void state.complete('sign_in')}>
          <span className="mr-2 inline-flex size-4">
            {busy && <LoaderCircle className="size-4 animate-spin" />}
          </span>
          {t('partnerLogin.confirm')}
        </Button>
        <Button
          variant="secondary"
          disabled={!ready || !account}
          className={account ? '' : 'invisible'}
          onClick={() => void state.complete('link')}
        >
          {t('partnerLogin.link', { username: account?.username ?? '' })}
        </Button>
        <Button variant="ghost" disabled={state.phase === 'submitting'} onClick={state.cancel}>
          {t('partnerLogin.cancel')}
        </Button>
      </div>
    </ModalDialog>
  )
}
