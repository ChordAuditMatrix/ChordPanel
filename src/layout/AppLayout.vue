<template>
  <div class="app-layout" :class="{ 'app-dark': isDark }">
    <n-layout style="height: 100vh; background: transparent;">
      <!-- ── Floating frosted glass sidebar (covers content; auto-expand on hover) ── -->
      <AppSidebar
        v-model:collapsed="collapsed"
        v-model:pinned="pinned"
        @open-settings="overlaysRef?.openSettings()"
      />

      <!-- ── Main content area (full width; sidebar floats above it) ── -->
      <n-layout class="main-layout" :bordered="false" :style="{ paddingLeft: `${contentOffset}px` }">
        <AppTopbar :title="pageTitle" :group="pageGroup" :offset="headerOffset" />
        <n-layout-content content-style="padding: 76px var(--page-gutter, 24px) 96px;" class="apple-content">
          <router-view />
        </n-layout-content>

        <BackendOfflineOverlay :online="backendOnline" :url="requestBase" />
      </n-layout>
    </n-layout>

    <GlobalOverlays ref="overlaysRef" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import { useTheme } from '@/stores/theme'
import { resolveApiBaseUrl, useSettings } from '@/stores/settings'
import { setupGlobalPolling } from '@/composables/usePagePolling'
import { useI18n } from '@/stores/i18n'
import AppSidebar from './AppSidebar.vue'
import AppTopbar from './AppTopbar.vue'
import BackendOfflineOverlay from './BackendOfflineOverlay.vue'
import GlobalOverlays from './GlobalOverlays.vue'
import { findNavGroup, findNavItem } from './navigation'
import { useBackendHealth } from './useBackendHealth'

const route = useRoute()
const { isDark } = useTheme()
const { settings, backendOnline } = useSettings()
const { t } = useI18n()

// Sidebar: collapsed by default, auto-expands on hover, can be pinned via the logo bar.
const collapsed = ref(true)
const pinned = ref(false)

// Hover-expanding keeps the 72px rail so the glass floats over the content;
// only a pinned sidebar gets its own 240px column.
const contentOffset = computed(() => (collapsed.value || !pinned.value ? 72 : 240))
const headerOffset = computed(() => (collapsed.value ? 72 : 240))

const routeName = computed(() => (route.name ? String(route.name) : null))
const pageTitle = computed(() => {
  const item = findNavItem(routeName.value)
  return item ? t(item.labelKey) : t('app.name')
})
const pageGroup = computed(() => {
  const group = findNavGroup(routeName.value)
  return group ? t(group.labelKey) : null
})

// Browser tab title follows the sidebar: "page · product", localized.
watchEffect(() => {
  const appName = t('app.name')
  document.title = pageTitle.value === appName ? appName : `${pageTitle.value} · ${appName}`
})

/*
 * Address the API requests actually use (mirrors src/api/request.ts): an empty
 * backend URL means the same-origin /api, and dev builds always go through the
 * Vite proxy. Shown by the offline overlay so it never reads "Listening: ".
 */
const requestBase = computed(() => {
  const apiBase = resolveApiBaseUrl(settings.value.backendUrl, import.meta.env.DEV)
  return apiBase.startsWith('/') ? `${window.location.origin}${apiBase}` : apiBase
})

const overlaysRef = ref<InstanceType<typeof GlobalOverlays> | null>(null)

// Global health check — ensures every page shows the correct backend connection state
useBackendHealth()

// Per-page polling: only the active route's registered handlers run
setupGlobalPolling(() => route.path)
</script>

<style scoped>
/* ── Main layout positioning context ── */
.main-layout {
  position: relative;
  background: transparent !important;
  /* padding-left is dynamic: collapsed/hover-expand keep 72px so the glass floats
     over content; pinned yields the full 240px so nothing stays covered. */
  transition: padding-left 400ms var(--apple-spring, cubic-bezier(0.32, 0.72, 0, 1));
}

/* ── Content area ── */
.apple-content {
  --page-gutter: 24px;
  background: transparent !important;
}

@media (max-width: 640px) {
  .apple-content { --page-gutter: 12px; }
}
</style>
