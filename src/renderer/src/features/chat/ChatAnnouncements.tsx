import { useEffect } from 'react'
import { create } from 'zustand'
import { toast } from 'react-toastify'
import { isChatAnnouncement, type ChatAnnouncement } from '../../../../shared/friends'
import { useAuthStore } from '../auth/auth.store'

const useAnnouncements = create<{ items: ChatAnnouncement[] }>(() => ({ items: [] }))
function AnnouncementText({ item }: { item: ChatAnnouncement }) {
  return <p className="break-words text-sm"><span className="font-semibold text-amber-300">[{item.tag}] </span><span className="font-semibold text-cyan-300">{item.sender.username}: </span><span>{item.message}</span></p>
}
export function ChatAnnouncements() {
  const playerId = useAuthStore(state => state.session?.player.id)
  useEffect(() => {
    useAnnouncements.setState({ items: [] })
    if (!playerId) return
    return window.api.matchmaking.onEvent(event => {
      if (event.type !== 'chat_announcement' || !isChatAnnouncement(event.announcement) || useAuthStore.getState().session?.player.id !== playerId) return
      const item = event.announcement
      if (useAnnouncements.getState().items.some(previous => previous.id === item.id)) return
      useAnnouncements.setState(state => ({ items: [...state.items, item].slice(-20) }))
      toast(<AnnouncementText item={item} />, { toastId: `announcement:${item.id}`, autoClose: 10000 })
    })
  }, [playerId])
  return null
}
