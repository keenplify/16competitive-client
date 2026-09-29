/* eslint-disable react-refresh/only-export-components */
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

function NextClientOverlayProbe(): React.JSX.Element {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <main className="probe" aria-label="NextClient React overlay proof">
      <div className="probe-mark">16C</div>
      <div>
        <strong>REACT OVER NEXTCLIENT</strong>
        <small>External UI proof · {seconds}s · no client.dll replacement</small>
      </div>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<NextClientOverlayProbe />)
