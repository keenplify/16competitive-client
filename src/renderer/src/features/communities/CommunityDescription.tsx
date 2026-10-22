import { useId, useState, type JSX } from 'react'
import { twMerge } from 'tailwind-merge'
import { Button } from '../../components/ui/Button'
import { useTranslation } from '../i18n/i18n'

export function CommunityDescription({
  description,
  className
}: {
  description: string
  className?: string
}): JSX.Element {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const id = useId()
  const lengthy = description.length > 240 || description.split('\n').length > 3
  return (
    <div className={twMerge('community-description', className)}>
      <p
        id={id}
        className={twMerge(
          'break-words text-sm leading-relaxed text-neutral-300',
          expanded ? 'whitespace-pre-wrap' : 'line-clamp-3 whitespace-normal'
        )}
      >
        {description || t('directory.noDescription')}
      </p>
      {lengthy && (
        <Button
          variant="ghost"
          className="mt-1 h-8 px-0 text-xs"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded(!expanded)}
        >
          {t(expanded ? 'directory.hideDescription' : 'directory.showDescription')}
        </Button>
      )}
    </div>
  )
}
