import { createPortal } from 'react-dom'
import type { ReactNode, ReactPortal } from 'react'

interface ModalPortalProps {
  children: ReactNode
}

export function ModalPortal({ children }: ModalPortalProps): ReactPortal {
  return createPortal(children, document.body)
}
