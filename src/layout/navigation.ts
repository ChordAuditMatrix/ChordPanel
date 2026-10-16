import type { Component } from 'vue'
import {
  AlbumsOutline,
  ConstructOutline,
  FingerPrintOutline,
  GitCommitOutline,
  KeyOutline,
  ListOutline,
  PeopleOutline,
  ServerOutline,
  ShieldCheckmarkOutline,
  SpeedometerOutline,
} from '@vicons/ionicons5'

export interface NavItem {
  /** Route name — also used as the menu key. */
  key: string
  /** Locale key of the label (see src/locales/*.ts) */
  labelKey: string
  icon: Component
}

export interface NavGroup {
  key: string
  labelKey: string
  items: NavItem[]
}

/**
 * Sidebar navigation, grouped by the workflow the pages belong to.
 * Route names (and therefore URLs) are stable — grouping only changes presentation.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    key: 'group-overview',
    labelKey: 'menu.groups.overview',
    items: [{ key: 'dashboard', labelKey: 'menu.dashboard', icon: SpeedometerOutline }],
  },
  {
    key: 'group-audit',
    labelKey: 'menu.groups.audit',
    items: [
      { key: 'audit', labelKey: 'menu.audit', icon: ShieldCheckmarkOutline },
      { key: 'identity', labelKey: 'menu.identity', icon: FingerPrintOutline },
      { key: 'ownership', labelKey: 'menu.ownership', icon: KeyOutline },
    ],
  },
  {
    key: 'group-resources',
    labelKey: 'menu.groups.resources',
    items: [
      { key: 'users', labelKey: 'menu.users', icon: PeopleOutline },
      { key: 'algorithms', labelKey: 'menu.algorithms', icon: ConstructOutline },
      { key: 'auditTables', labelKey: 'menu.auditTables', icon: AlbumsOutline },
    ],
  },
  {
    key: 'group-runtime',
    labelKey: 'menu.groups.runtime',
    items: [
      { key: 'jobs', labelKey: 'menu.jobs', icon: ListOutline },
      { key: 'nodes', labelKey: 'menu.nodes', icon: ServerOutline },
      { key: 'events', labelKey: 'menu.events', icon: GitCommitOutline },
    ],
  },
]

const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap(group => group.items)

export function findNavItem(routeName: string | null | undefined): NavItem | undefined {
  if (!routeName) return undefined
  return NAV_ITEMS.find(item => item.key === routeName)
}

export function findNavGroup(routeName: string | null | undefined): NavGroup | undefined {
  if (!routeName) return undefined
  return NAV_GROUPS.find(group => group.items.some(item => item.key === routeName))
}
