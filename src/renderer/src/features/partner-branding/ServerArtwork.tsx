import { useState, type JSX } from 'react'
import { twMerge } from 'tailwind-merge'
import {
  serverArtworkSources,
  type PartnerServerStatus
} from '../../../../shared/partner-community'
import { localMapPreviews } from '../matchmaking/map-previews'

function Artwork({
  sources,
  className
}: {
  sources: string[]
  className?: string
}): JSX.Element | null {
  const [index, setIndex] = useState(0)
  return sources[index] ? (
    <img
      src={sources[index]}
      alt=""
      loading="lazy"
      className={twMerge('absolute inset-0 size-full object-cover', className)}
      onError={() => setIndex((value) => value + 1)}
    />
  ) : null
}

export function ServerArtwork({
  server,
  className
}: {
  server: PartnerServerStatus
  className?: string
}): JSX.Element {
  const bundled =
    server.map && Object.hasOwn(localMapPreviews, server.map)
      ? localMapPreviews[server.map]
      : undefined
  const sources = serverArtworkSources(server, bundled || undefined)
  return <Artwork key={sources.join('\n')} sources={sources} className={className} />
}
