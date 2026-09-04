import { Gauge, Settings, Wallet, type LucideIcon } from 'lucide-react'

export interface NavItem {
  path: string
  label: string
  icon: LucideIcon
  description: string
}

/**
 * Three routes. Everything the app does is credit health; accounts exist to
 * feed it and settings to hold your data. A fourth would mean the app had
 * started doing something it was not asked to do.
 */
export const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'Credit health', icon: Gauge, description: 'Score, utilization and what to do next' },
  { path: '/accounts', label: 'Accounts', icon: Wallet, description: 'Your cards, lines of credit and loans' },
  { path: '/settings', label: 'Settings', icon: Settings, description: 'Your goal, your data and the app' },
]

export function navItemFor(path: string): NavItem | undefined {
  return NAV_ITEMS.find((item) => item.path === path)
}
