import { useEffect } from 'react'
import { toast } from 'react-toastify'
import { useTranslation } from '../i18n/i18n'
import { useQueueWarmupStore } from './queue-warmup.store'

export function QueueWarmupNotice(): null {
  const { t } = useTranslation()
  const status = useQueueWarmupStore((state) => state.status)
  useEffect(() => {
    if (status !== 'starting' && status !== 'leaving') return
    const id = toast.loading(t('warmup.preparing'), { closeButton: false, closeOnClick: false })
    return () => toast.dismiss(id)
  }, [status, t])
  return null
}
