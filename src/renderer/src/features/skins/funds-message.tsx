import { TopUpNow } from './TopUpNow'

export function fundsMessage(message: string, onOpen?: () => void) {
  return (
    <span>
      {message} <TopUpNow onOpen={onOpen} />
    </span>
  )
}
