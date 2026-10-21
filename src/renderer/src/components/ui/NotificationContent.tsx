import type { JSX } from 'react'
import { twMerge } from 'tailwind-merge'

interface NotificationContentProps {
  title: string
  message: string
  className?: string
}

export function NotificationContent({
  title,
  message,
  className
}: NotificationContentProps): JSX.Element {
  return (
    <div className={twMerge('launcher-notification-content min-w-0', className)}>
      <p className="launcher-notification-title">{title}</p>
      <p className="launcher-notification-message">{message}</p>
    </div>
  )
}
