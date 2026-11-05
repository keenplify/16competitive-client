import { useEffect, useRef, type JSX } from 'react'
import { toast, ToastContainer, type Id } from 'react-toastify'
import { useTranslation } from '../renderer/src/features/i18n/i18n'
import { usePartnerReturnStore } from './partner-return.store'

export function PartnerReturnScreen(): JSX.Element {
  const { t } = useTranslation()
  const { returnUrl, partnerName, ready } = usePartnerReturnStore()
  const toastId = useRef<Id | null>(null)
  useEffect(() => {
    toastId.current = toast.loading(t('partnerLogin.returnPending'))
    return () => {
      if (toastId.current !== null) toast.dismiss(toastId.current)
    }
  }, [t])
  useEffect(() => {
    if (ready && toastId.current !== null) {
      toast.update(toastId.current, {
        render: t('partnerLogin.returnReady'),
        type: 'success',
        isLoading: false,
        autoClose: 5000
      })
    }
  }, [ready, t])
  return (
    <main className="fixed inset-0 flex items-center justify-center bg-neutral-950 p-6 text-white">
      <ToastContainer position="top-left" theme="dark" />
      <a
        href={ready ? (returnUrl ?? undefined) : undefined}
        aria-disabled={!ready}
        target="_top"
        className="border border-white/30 p-4 underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
      >
        {t('partnerLogin.returnToPartner', { partner: partnerName })}
      </a>
    </main>
  )
}
