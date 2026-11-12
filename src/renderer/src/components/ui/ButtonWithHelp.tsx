import type { ComponentProps, JSX } from 'react'
import { twMerge } from 'tailwind-merge'
import { Button } from './Button'
import { HelpTooltip } from './HelpTooltip'

type ButtonWithHelpProps = ComponentProps<typeof Button> & {
  helpText: string
  buttonClassName?: string
}

/** The help control sits inside the action's outline but remains independently focusable. */
export function ButtonWithHelp({
  className,
  buttonClassName,
  helpText,
  children,
  ...props
}: ButtonWithHelpProps): JSX.Element {
  return (
    <span className={twMerge('relative inline-flex h-11 min-w-0 text-neutral-950', className)}>
      <Button className={twMerge('h-full w-full pl-2 pr-7', buttonClassName)} {...props}>
        <span className="min-w-0 truncate">{children}</span>
      </Button>
      <HelpTooltip
        text={helpText}
        placement="top"
        className="absolute right-1 top-1/2 -translate-y-1/2"
      />
    </span>
  )
}
