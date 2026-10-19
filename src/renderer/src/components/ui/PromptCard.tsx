import type { HTMLAttributes, JSX } from 'react'
import { twMerge } from 'tailwind-merge'

export function PromptCard({ className, ...props }: HTMLAttributes<HTMLElement>): JSX.Element {
  return (
    <section
      className={twMerge(
        'border border-sky-300/35 border-l-[3px] border-l-sky-400 bg-neutral-950 px-5 py-4 text-left shadow-[0_12px_28px_rgba(0,0,0,0.7)]',
        className
      )}
      {...props}
    />
  )
}
