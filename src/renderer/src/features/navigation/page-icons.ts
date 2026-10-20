import {
  Film,
  House,
  Newspaper,
  Play,
  Settings,
  ShoppingBag,
  Trophy,
  UserRound,
  Users,
  type LucideIcon
} from 'lucide-react'
import type { LobbyPageId } from './navigation.store'

/** Keep navigation and window titlebars visually consistent. */
export const pageIcons: Record<LobbyPageId, LucideIcon> = {
  lobby: House,
  demos: Film,
  profile: UserRound,
  leaderboard: Trophy,
  play: Play,
  store: ShoppingBag,
  communities: Users,
  news: Newspaper,
  settings: Settings
}
