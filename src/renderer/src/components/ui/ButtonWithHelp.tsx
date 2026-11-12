import type { ComponentProps, JSX } from 'react'
import { twMerge } from 'tailwind-merge'
import { CircleHelp } from 'lucide-react'
import { Button } from './Button'
import { HelpTooltip } from './HelpTooltip'

type ButtonWithHelpProps = ComponentProps<typeof Button> & {
  helpText: string
  buttonClassName?: string
}

/** One action and one focus target; the help icon is decorative. */
export function ButtonWithHelp({
  className,
  buttonClassName,
  helpText,
  children,
  ...props
}: ButtonWithHelpProps): JSX.Element {
  return (
    <HelpTooltip
      text={helpText}
      placement="top"
      className={twMerge('h-11 min-w-0', className)}
      renderTrigger={(trigger) => (
        <Button
          {...trigger}
          {...props}
          className={twMerge('h-full w-full gap-1 px-2', buttonClassName)}
        >
          <span className="min-w-0 truncate">{children}</span>
          <CircleHelp className="pointer-events-none size-4 shrink-0" aria-hidden="true" />
        </Button>
      )}
    />
  )
}
