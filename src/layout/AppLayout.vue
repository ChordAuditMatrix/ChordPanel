<template>
  <div class="app-layout" :class="{ 'app-dark': isDark }">
    <n-layout style="height: 100vh; background: transparent;">
      <!-- Docked rail on desktop, off-canvas drawer on narrow screens. -->
      <AppSidebar
        v-model:collapsed="collapsed"
        v-model:open="mobileNavOpen"
        :mobile="isMobile"
        :width="SIDEBAR_WIDTH"
        :collapsed-width="SIDEBAR_COLLAPSED_WIDTH"
        @open-settings="overlaysRef?.openSettings()"
      />

      <!-- The page is inert while the mobile drawer is open, so keyboard focus
           cannot wander behind the backdrop. -->
      <div class="main-shell" :inert="isMobile && mobileNavOpen">
        <n-layout class="main-layout" :bordered="false" :style="{ paddingLeft: `${contentOffset}px` }">
          <AppTopbar
            :title="pageTitle"
            :group="pageGroup"
            :offset="contentOffset"
            :mobile="isMobile"
            :nav-open="mobileNavOpen"
            @open-nav="mobileNavOpen = true"
            @open-job-progress="overlaysRef?.openJobProgress()"
          />
          <n-layout-content content-style="padding: 76px var(--page-gutter, 24px) 96px;" class="apple-content">
            <router-view />
          </n-layout-content>

          <BackendOfflineOverlay :online="backendOnline" :url="requestBase" />
        </n-layout>
      </div>
    </n-layout>

    <div class="global-overlays-shell" :inert="isMobile && mobileNavOpen">
      <GlobalOverlays ref="overlaysRef" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, watchEffect } from 'vue'
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

/** Single source of truth for the sidebar geometry; the drawer width lives in AppSidebar. */
const SIDEBAR_WIDTH = 240
const SIDEBAR_COLLAPSED_WIDTH = 72
const SIDEBAR_STORAGE_KEY = 'chord-panel-sidebar-collapsed'
const MOBILE_MEDIA_QUERY = '(max-width: 900px)'

const route = useRoute()
const { isDark } = useTheme()
const { settings, backendOnline } = useSettings()
const { t } = useI18n()

/**
 * Collapse preference survives reloads. Anything unreadable (private mode,
 * corrupted value) falls back to the expanded desktop default.
 */
function readCollapsedPreference(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY)
    if (stored === 'true') return true
    if (stored === 'false') return false
  } catch {
    /* Storage blocked — use the default. */
  }
  return false
}

const collapsed = ref(readCollapsedPreference())
const mobileNavOpen = ref(false)

const isMobile = ref(
  typeof window !== 'undefined' && window.matchMedia(MOBILE_MEDIA_QUERY).matches,
)

let mediaQuery: MediaQueryList | null = null

function syncViewport() {
  isMobile.value = mediaQuery?.matches ?? false
}

// Expanded 240px and collapsed 72px both move the content and the topbar by the
// exact same amount; narrow screens reserve no column and use the drawer instead.
const contentOffset = computed(() => {
  if (isMobile.value) return 0
  return collapsed.value ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH
})

const routeName = computed(() => (route.name ? String(route.name) : null))

/** Routes outside the sidebar (e.g. execution detail) label themselves via meta. */
function metaLabel(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

const metaTitleKey = computed(() => metaLabel(route.meta.titleKey))
const metaGroupKey = computed(() => metaLabel(route.meta.groupKey))

const pageTitle = computed(() => {
  if (metaTitleKey.value) return t(metaTitleKey.value)
  const item = findNavItem(routeName.value)
  return item ? t(item.labelKey) : t('app.name')
})
const pageGroup = computed(() => {
  if (metaGroupKey.value) return t(metaGroupKey.value)
  const group = findNavGroup(routeName.value)
  return group ? t(group.labelKey) : null
})

// Browser tab title follows the sidebar: "page · product", localized.
watchEffect(() => {
  const appName = t('app.name')
  document.title = pageTitle.value === appName ? appName : `${pageTitle.value} · ${appName}`
})

watch(collapsed, (value) => {
  try {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(value))
  } catch {
    /* Storage blocked — the in-memory state still works. */
  }
})

// Any navigation (including the current route) leaves the mobile drawer closed.
watch(() => route.fullPath, () => {
  mobileNavOpen.value = false
})

watch(isMobile, () => {
  mobileNavOpen.value = false
})

onMounted(() => {
  mediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY)
  syncViewport()
  mediaQuery.addEventListener('change', syncViewport)
})

onUnmounted(() => {
  mediaQuery?.removeEventListener('change', syncViewport)
  mediaQuery = null
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
.main-shell {
  height: 100vh;
}

.main-layout {
  position: relative;
  background: transparent !important;
  /* padding-left mirrors the docked sidebar width, so expanding the rail never
     covers the working area. */
  transition: padding-left var(--apple-dur) var(--apple-spring);
}

/* ── Content area ── */
.apple-content {
  box-sizing: border-box;
  width: 100%;
  max-width: 1640px;
  margin-inline: auto;
  --page-gutter: 24px;
  background: transparent !important;
}
@media (max-width: 640px) {
  .apple-content { --page-gutter: 12px; }
}

@media (prefers-reduced-motion: reduce) {
  .main-layout {
    transition: none;
  }
}
</style>
