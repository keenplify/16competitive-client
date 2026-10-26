import type { ReactNode } from 'react'
import { twMerge } from 'tailwind-merge'
import { formatChatTimestamp, showChatTimestamp } from '../../../../shared/chat-timestamps'

interface ChatMessageRowProps {
  sentAt: string
  previousSentAt?: string
  language: string
  className?: string
  children: ReactNode
}

/** Shared presentation for every lobby chat channel and system message. */
export function ChatMessageRow({
  sentAt,
  previousSentAt,
  language,
  className,
  children
}: ChatMessageRowProps) {
  const timestamp = formatChatTimestamp(sentAt, language)
  return (
    <div className={twMerge('min-w-0', className)} title={timestamp?.full}>
      {timestamp && showChatTimestamp(sentAt, previousSentAt) && (
        <time
          dateTime={sentAt}
          className="chat-message-timestamp my-2 block text-center text-[11px] leading-5 font-normal text-neutral-400"
          title={timestamp.full}
        >
          {timestamp.label}
        </time>
      )}
      <p className="break-words">{children}</p>
    </div>
  )
}
