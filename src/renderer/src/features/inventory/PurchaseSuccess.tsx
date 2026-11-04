import { Button } from '../../components/ui/Button'
import { useNavigationStore, type PurchasedItem } from '../navigation/navigation.store'
import { useInventoryText } from './inventory-i18n'
export function PurchaseSuccess({
  item,
  closeToast
}: {
  item: PurchasedItem
  closeToast?: () => void
}) {
  const t = useInventoryText()
  return (
    <Button
      variant="ghost"
      onClick={() => {
        useNavigationStore.getState().openPurchasedItem(item)
        closeToast?.()
      }}
    >
      {t('openLoadout')}
    </Button>
  )
}
