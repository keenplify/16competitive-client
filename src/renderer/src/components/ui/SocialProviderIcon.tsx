import type { SVGProps } from 'react'
import { twMerge } from 'tailwind-merge'
import type { SocialAuthProvider } from '../../../../shared/auth'

interface SocialProviderIconProps extends SVGProps<SVGSVGElement> {
  provider: SocialAuthProvider
}

export function SocialProviderIcon({
  provider,
  className,
  ...props
}: SocialProviderIconProps): React.JSX.Element {
  if (provider === 'google') {
    return (
      <svg
        viewBox="0 0 24 24"
        className={twMerge('size-5 shrink-0', className)}
        aria-hidden="true"
        {...props}
      >
        <path
          fill="#4285F4"
          d="M21.6 12.23c0-.71-.06-1.24-.2-1.8H12v3.4h5.52a4.7 4.7 0 0 1-2.05 3.08v2.2h3.32c1.94-1.79 2.81-4.43 2.81-6.88Z"
        />
        <path
          fill="#34A853"
          d="M12 22c2.7 0 4.97-.89 6.63-2.42l-3.32-2.2c-.89.6-2.04.96-3.31.96-2.61 0-4.83-1.76-5.62-4.14H2.96v2.27A10 10 0 0 0 12 22Z"
        />
        <path
          fill="#FBBC05"
          d="M6.38 14.2A6 6 0 0 1 6.06 12c0-.76.13-1.5.32-2.2V7.53H2.96A10 10 0 0 0 2 12c0 1.61.38 3.14.96 4.47l3.42-2.27Z"
        />
        <path
          fill="#EA4335"
          d="M12 5.66c1.47 0 2.79.51 3.83 1.5l2.87-2.87A9.64 9.64 0 0 0 12 2a10 10 0 0 0-9.04 5.53L6.38 9.8C7.17 7.42 9.39 5.66 12 5.66Z"
        />
      </svg>
    )
  }

  if (provider === 'facebook') {
    return (
      <svg
        viewBox="0 0 24 24"
        className={twMerge('size-5 shrink-0', className)}
        aria-hidden="true"
        {...props}
      >
        <circle cx="12" cy="12" r="12" fill="#1877F2" />
        <path
          fill="#fff"
          d="m16.67 15.56.53-3.49h-3.33V9.81c0-.95.47-1.88 1.96-1.88h1.51V4.95s-1.37-.23-2.68-.23c-2.74 0-4.54 1.67-4.54 4.69v2.66H7.08v3.49h3.04V24a12.4 12.4 0 0 0 3.75 0v-8.44h2.8Z"
        />
      </svg>
    )
  }

  return (
    <svg
      viewBox="0 0 127.14 96.36"
      className={twMerge('size-5 shrink-0', className)}
      aria-hidden="true"
      {...props}
    >
      <path
        fill="#5865F2"
        d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.11 0A72.37 72.37 0 0 0 45.64 0 105.89 105.89 0 0 0 19.39 8.09C2.79 32.65-1.71 56.6.54 80.21a105.73 105.73 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-8.89 68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2.05a75.57 75.57 0 0 0 64.32 0c.87.71 1.76 1.39 2.66 2.05a68.68 68.68 0 0 1-10.87 5.19 77 77 0 0 0 6.89 8.88 105.25 105.25 0 0 0 32.18-16.14C129.23 52.84 122.09 29.11 107.7 8.07ZM42.45 65.69C36.18 65.69 31 59.94 31 52.86S36.08 40 42.45 40s11.5 5.79 11.39 12.9-5.02 12.79-11.39 12.79Zm42.24 0c-6.27 0-11.41-5.75-11.41-12.83S78.33 40 84.69 40s11.5 5.79 11.39 12.9-5.02 12.79-11.39 12.79Z"
      />
    </svg>
  )
}
