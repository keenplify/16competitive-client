import type { DetailedHTMLProps, HTMLAttributes, JSX } from 'react'
import { twMerge } from 'tailwind-merge'

export function Logo({
  className
}: DetailedHTMLProps<HTMLAttributes<HTMLDivElement>, HTMLDivElement>): JSX.Element {
  return (
    <div
      className={twMerge(
        'font-audiowide text-4xl h-16 w-16 flex justify-center items-center',
        className
      )}
    >
      <img src="./favicon.svg" alt="1.6 Competitive" className="w-full h-full object-contain" />
    </div>
  )
}
