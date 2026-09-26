import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

export function OverlayProbe(): React.JSX.Element {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [])
  return (
    <div className="badge">
      <div className="mark">16C</div>
      <div>
        <strong>REACT IN GAME</strong>
        <small>GoldSrc overlay proof · {seconds}s</small>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<OverlayProbe />)
