<template>
  <div class="apple-nav-keyboard" @keydown="onMenuKeydown">
    <n-menu
      class="apple-nav"
      :class="{ 'apple-nav-collapsed': collapsed }"
      :collapsed="collapsed"
      :collapsed-width="72"
      :collapsed-icon-size="22"
      :options="options"
      :value="value"
      :node-props="nodeProps"
      @update:value="onSelect"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, h, ref, type Component } from 'vue'
import { NIcon, type MenuGroupOption, type MenuOption } from 'naive-ui'
import { NAV_GROUPS } from './navigation'
import { useI18n } from '@/stores/i18n'

const props = defineProps<{
  /** Active route name. */
  value: string | null
  /** Icon-only rail: a 72px rail cannot render group titles, so items flatten. */
  collapsed: boolean
}>()

const emit = defineEmits<{ select: [key: string] }>()

const { t } = useI18n()

function renderIcon(icon: Component) {
  return () => h(NIcon, { size: 22 }, { default: () => h(icon) })
}

function toMenuItem(key: string, labelKey: string, icon: Component): MenuOption {
  return { key, label: t(labelKey), icon: renderIcon(icon) }
}

/** Every routable key, in DOM order for both the grouped and the collapsed flattening. */
const itemKeys = computed(() => NAV_GROUPS.flatMap(group => group.items.map(item => item.key)))

/** Last item moved to with the arrow keys; separate from the selected route. */
const focusedKey = ref<string | null>(null)

/**
 * Roving tabindex: exactly one item is Tab-reachable. Prefer the item the user last
 * focused by keyboard, else the active route, else the first item.
 */
const tabStopKey = computed(() => {
  const focused = focusedKey.value
  if (focused && itemKeys.value.includes(focused)) return focused
  if (props.value && itemKeys.value.includes(props.value)) return props.value
  return itemKeys.value[0] ?? null
})

const options = computed<MenuOption[]>(() => {
  // Read so the option list re-renders (and node-props re-runs) when the tab stop moves.
  void tabStopKey.value
  if (props.collapsed) {
    return NAV_GROUPS.flatMap(group =>
      group.items.map(item => toMenuItem(item.key, item.labelKey, item.icon))
    )
  }
  return NAV_GROUPS.map((group): MenuOption => ({
    type: 'group',
    key: group.key,
    label: t(group.labelKey),
    children: group.items.map(item => toMenuItem(item.key, item.labelKey, item.icon)),
  }))
})

/**
 * Naive renders every option's DOM node with role=menuitem but no tabindex, so the
 * menu is unreachable with Tab. Add tabindex plus arrow/Home/End/Enter handling here.
 */
function nodeProps(option: MenuOption | MenuGroupOption): Record<string, string | number | undefined> {
  const key = option.key
  if (key === undefined || option.disabled || !itemKeys.value.includes(String(key))) return {}
  return {
    'data-nav-key': String(key),
    tabindex: String(key) === tabStopKey.value ? 0 : -1,
  }
}

function menuItems(current: HTMLElement): HTMLElement[] {
  const root = current.closest('[role="menu"]')
  if (!root) return []
  return Array.from(root.querySelectorAll<HTMLElement>('[role="menuitem"]')).filter(
    item => item.offsetParent !== null && !item.querySelector('.n-menu-item-content--disabled')
  )
}

function onMenuKeydown(event: KeyboardEvent) {
  if (!(event.target instanceof Element)) return
  const current = event.target.closest<HTMLElement>('[role="menuitem"]')
  const key = current?.dataset.navKey
  if (current && key) onItemKeydown(event, key, current)
}

function onItemKeydown(event: KeyboardEvent, key: string, current: HTMLElement) {
  if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return

  if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
    event.preventDefault()
    onSelect(key)
    return
  }

  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') {
    return
  }

  const items = menuItems(current)
  if (!items.length) return
  const index = items.indexOf(current)
  const from = index === -1 ? 0 : index

  let target: HTMLElement | undefined
  if (event.key === 'ArrowDown') target = items[(from + 1) % items.length]
  else if (event.key === 'ArrowUp') target = items[(from - 1 + items.length) % items.length]
  else if (event.key === 'Home') target = items[0]
  else target = items[items.length - 1]

  if (!target) return
  event.preventDefault()
  const nextKey = target.dataset.navKey
  if (nextKey) focusedKey.value = nextKey
  // Moving focus must not navigate: only the select emit changes the route.
  target.focus()
}

function onSelect(key: string) {
  focusedKey.value = key
  emit('select', key)
}
</script>

<style scoped>
.apple-nav {
  padding: 8px 12px;
}

/* Collapsed rail: Naive centers the icon via paddingLeft = collapsedWidth/2 - iconSize/2;
   our container padding breaks that formula — drop it while collapsed. */
.apple-nav-collapsed {
  padding-left: 0 !important;
  padding-right: 0 !important;
}

:deep(.n-menu-item-content) {
  border-radius: 10px !important;
  margin-bottom: 2px !important;
}

/* Collapsed hover highlight: inset from the rail edges so it frames the icon snugly.
   Naive's inline paddingLeft (25px) assumes a 72px rail; with 7px margins the content
   box is 58px, so keep the icon centered with 18px. */
.apple-nav-collapsed :deep(.n-menu-item-content) {
  margin-left: 7px !important;
  margin-right: 7px !important;
  padding-left: 18px !important;
}

:deep(.n-menu-item:focus) {
  outline: none;
}

/* Keyboard-only focus ring on the item body (the menuitem div itself has no visuals). */
:deep(.n-menu-item:focus-visible .n-menu-item-content) {
  outline: 2px solid var(--apple-blue, #0071E3);
  outline-offset: -2px;
}

:deep(.n-menu-item-group-title) {
  font-size: 12px;
  color: var(--apple-gray-3);
}

:deep(.n-menu-item-content--selected) {
  background: rgba(39, 105, 220, 0.08) !important;
  color: var(--apple-blue, #0071E3) !important;
}
:deep(.n-menu-item-content--selected .n-menu-item-content-header) {
  color: var(--apple-blue, #0071E3) !important;
  font-weight: 600;
}
:deep(.n-menu-item-content--selected .n-menu-item-icon) {
  color: var(--apple-blue, #0071E3) !important;
}
:global(.app-dark .apple-nav .n-menu-item-content--selected) {
  background: rgba(128, 170, 255, 0.14) !important;
}
:global(.app-dark .apple-nav .n-menu-item-content--selected .n-menu-item-content-header),
:global(.app-dark .apple-nav .n-menu-item-content--selected .n-menu-item-icon) {
  color: var(--apple-blue, #0A84FF) !important;
}

:deep(.n-menu-item-content--selected::before) {
  display: none !important;
}
</style>
