import { useLayoutEffect, useState, type ReactNode, type ReactPortal } from 'react'
import { createPortal } from 'react-dom'

import { attachToastHost } from './modal-toast-host'

export function ModalToastLayer({ children }: { children: ReactNode }): ReactPortal {
  const [element] = useState(() => document.createElement('div'))
  useLayoutEffect(() => attachToastHost(element), [element])
  return createPortal(children, element)
}
