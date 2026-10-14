import { twMerge } from 'tailwind-merge'
import { LoaderCircle, Link2 } from 'lucide-react'
import { useTranslation } from '../i18n/i18n'
import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/TextField'
import { useCommunityMembershipStore } from './community-membership.store'
import { usePartnerBrandingStore } from './partner-branding.store'
import { useAuthStore } from '../auth/auth.store'
export function CommunitySettings({ className }: { className?: string }) {
  const { t } = useTranslation()
  const branding = usePartnerBrandingStore((state) => state.branding),
    playerId = useAuthStore((state) => state.session?.player.id)
  const state = useCommunityMembershipStore()
  return (
    <section
      className={twMerge('mb-5 border border-white/10 bg-neutral-900/90 p-5 sm:p-7', className)}
      aria-labelledby="community-settings-title"
    >
      <h3 id="community-settings-title" className="text-lg font-semibold">
        {t('community.title')}
      </h3>
      <p className="mt-2 min-h-10 text-sm text-neutral-300">
        {branding?.communityName ?? t('community.noMembership')}
      </p>
      <p className="mt-2 text-sm leading-6 text-neutral-400">{t('community.linkDescription')}</p>
      <form
        className="mt-4 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          void state.linkServer()
        }}
      >
        <TextField
          id="community-server-code"
          label={t('community.linkCode')}
          value={state.linkCode}
          onChange={(event) => state.setLinkCode(event.target.value)}
          maxLength={12}
          autoComplete="off"
          placeholder="A1B2C3D4E5F6"
          disabled={state.linking}
          className="min-w-48 flex-1"
        />
        <Button
          type="submit"
          variant="secondary"
          disabled={state.linking || state.linkCode.length !== 12}
          className="h-11 w-40 gap-2"
        >
          {state.linking ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Link2 className="size-4" aria-hidden="true" />
          )}
          {t('community.confirmLink')}
        </Button>
      </form>
      <div className="mt-3 h-20 overflow-y-auto text-sm" role="status" aria-live="polite">
        {state.linkResult === 'success' ? (
          <p className="text-emerald-300">{t('community.linkSuccess')}</p>
        ) : state.linkResult === 'error' ? (
          <p className="text-red-300">{t('community.linkError')}</p>
        ) : state.error ? (
          <p className="text-red-300">{t('community.loadError')}</p>
        ) : null}
      </div>

      {state.error && playerId && (
        <Button variant="ghost" onClick={() => void state.load(playerId)} disabled={state.loading}>
          {t('community.retry')}
        </Button>
      )}
    </section>
  )
}
