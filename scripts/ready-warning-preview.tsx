import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { ReadyCheckWarningDialog } from '../src/renderer/src/features/matchmaking/ReadyCheckWarning'
import { Button } from '../src/renderer/src/components/ui/Button'
import '../src/renderer/src/assets/main.css'
export function Preview() {
  const [open, setOpen] = useState(true)
  return (
    <main className="min-h-screen bg-neutral-950 p-12 text-white">
      <Button onClick={() => setOpen(true)}>Preview warning</Button>
      {open && <ReadyCheckWarningDialog onAcknowledge={() => setOpen(false)} />}
    </main>
  )
}
createRoot(document.getElementById('root')!).render(<Preview />)
