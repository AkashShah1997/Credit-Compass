import {
  CreditCard,
  Compass,
  FileBarChart,
  Gauge,
  Landmark,
  LayoutDashboard,
  PiggyBank,
  Scale,
  Settings,
  Target,
  TrendingUp,
  ArrowLeftRight,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  path: string
  label: string
  /** Shortened for the mobile tab bar. */
  short?: string
  icon: LucideIcon
  description: string
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { path: '/', label: 'Credit health', short: 'Credit', icon: Gauge, description: 'Score, utilization and what to do next' },
      { path: '/overview', label: 'Money overview', short: 'Money', icon: LayoutDashboard, description: 'Balance, cash flow and this month at a glance' },
      { path: '/transactions', label: 'Transactions', short: 'Activity', icon: ArrowLeftRight, description: 'Every income and expense entry' },
      { path: '/reports', label: 'Reports', icon: FileBarChart, description: 'Monthly and yearly analysis, PDF and Excel export' },
    ],
  },
  {
    label: 'Plan',
    items: [
      { path: '/budget', label: 'Budget', icon: Target, description: 'Category limits, usage and alerts' },
      { path: '/savings', label: 'Savings', icon: PiggyBank, description: 'Goals, emergency fund and progress' },
      { path: '/planning', label: 'Planning', icon: Compass, description: 'Salary day, cash-flow forecast and financial independence' },
    ],
  },
  {
    label: 'Grow',
    items: [
      { path: '/investments', label: 'Investments', short: 'Invest', icon: TrendingUp, description: 'TFSA, RRSP, FHSA, GICs and other holdings' },
      { path: '/net-worth', label: 'Net worth', icon: Scale, description: 'Assets minus liabilities over time' },
    ],
  },
  {
    label: 'Owe',
    items: [
      { path: '/loans', label: 'Loans', icon: Landmark, description: 'Outstanding balances, payments and due dates' },
      { path: '/cards', label: 'Credit cards', short: 'Cards', icon: CreditCard, description: 'Bills, due dates and utilisation' },
    ],
  },
]

export const SETTINGS_ITEM: NavItem = {
  path: '/settings',
  label: 'Settings',
  icon: Settings,
  description: 'Profile, theme, alerts and your data',
}

export const ALL_NAV_ITEMS: NavItem[] = [...NAV_GROUPS.flatMap((group) => group.items), SETTINGS_ITEM]

/** The four routes that get a permanent slot in the mobile tab bar. */
export const MOBILE_PRIMARY = ['/', '/overview', '/transactions', '/cards']

export function navItemFor(path: string): NavItem | undefined {
  return ALL_NAV_ITEMS.find((item) => item.path === path)
}
