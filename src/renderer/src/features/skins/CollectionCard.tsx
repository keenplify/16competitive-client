import { twMerge } from 'tailwind-merge'
import { useCollectionText } from './collection-i18n'

export function CollectionCard({
  id,
  name,
  imageUrl,
  onOpen,
  className
}: {
  id: string
  name: string
  imageUrl: string
  onOpen: (id: string) => void
  className?: string
}) {
  const t = useCollectionText()
  return (
    <button
      type="button"
      onClick={() => onOpen(id)}
      className={twMerge(
        'group block w-full overflow-hidden border border-white/10 bg-neutral-950 text-left transition hover:border-sky-300/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300',
        className
      )}
    >
      <img
        src={imageUrl}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        className="aspect-video w-full object-cover"
      />
      <span className="block p-3">
        <strong className="line-clamp-2 block text-sm text-white">{name}</strong>
        <span className="mt-2 block text-xs text-sky-300">{t('view')}</span>
      </span>
    </button>
  )
}
