<template>
  <n-menu
    class="apple-nav"
    :class="{ 'apple-nav-collapsed': collapsed }"
    :collapsed="collapsed"
    :collapsed-width="72"
    :collapsed-icon-size="22"
    :options="options"
    :value="value"
    @update:value="onSelect"
  />
</template>

<script setup lang="ts">
import { computed, h, type Component } from 'vue'
import { NIcon, type MenuOption } from 'naive-ui'
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

const options = computed<MenuOption[]>(() => {
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

function onSelect(key: string) {
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

:deep(.n-menu-item-group-title) {
  font-size: 12px;
  color: var(--apple-gray-3);
}

:deep(.n-menu-item-content--selected) {
  background: rgba(0, 113, 227, 0.08) !important;
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
  background: rgba(10, 132, 255, 0.14) !important;
}
:global(.app-dark .apple-nav .n-menu-item-content--selected .n-menu-item-content-header),
:global(.app-dark .apple-nav .n-menu-item-content--selected .n-menu-item-icon) {
  color: var(--apple-blue, #0A84FF) !important;
}

:deep(.n-menu-item-content--selected::before) {
  display: none !important;
}
</style>
