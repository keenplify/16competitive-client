import { Button } from '../../components/ui/Button'
import { useTranslation } from '../i18n/i18n'
import { usePaymentsStore } from './payments.store'

export function TopUpNow({ onOpen }: { onOpen?: () => void } = {}) {
  const { t } = useTranslation()
  return (
    <Button
      type="button"
      variant="secondary"
      className="pointer-events-auto mx-1 px-3 py-2"
      onClick={() => {
        onOpen?.()
        usePaymentsStore.getState().show()
      }}
    >
      {t('payments.topUpNow')}
    </Button>
  )
}
