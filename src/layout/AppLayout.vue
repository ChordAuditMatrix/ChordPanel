<template>
  <div class="app-layout apple-glass-bg" :class="{ 'app-dark': isDark }">
    <n-layout style="height: 100vh; background: transparent;">
      <!-- ── Floating frosted glass sidebar (covers content; auto-expand on hover) ── -->
      <n-layout-sider
        position="absolute"
        collapse-mode="width"
        :collapsed-width="72"
        :width="240"
        :collapsed="collapsed"
        :native-scrollbar="false"
        :show-trigger="false"
        :bordered="false"
        class="apple-sidebar"
        @mouseenter="onSiderEnter"
        @mouseleave="onSiderLeave"
        @collapse="collapsed = true"
        @expand="collapsed = false"
      >
        <!-- Logo + pin (pin only makes sense while expanded) -->
        <div class="logo-area" :class="{ 'logo-collapsed': collapsed }">
          <img src="/logo.png" alt="logo" class="logo-img" />
          <transition name="apple-fade">
            <span v-if="!collapsed" class="logo-text">ChordPanel</span>
          </transition>
          <button
            v-if="!collapsed"
            class="pin-btn"
            :class="{ 'pin-btn-active': pinned }"
            @click="togglePin"
            :aria-label="t('common.toggleSidebar')"
            :title="t('common.toggleSidebar')"
          >
            <n-icon size="17" :component="pinned ? Pin : PinOutline" />
          </button>
        </div>

        <!-- Navigation menu -->
        <n-menu
          :collapsed="collapsed"
          :collapsed-width="72"
          :collapsed-icon-size="22"
          :options="menuOptions"
          :value="currentRoute"
          @update:value="handleMenuClick"
          class="apple-nav"
        />

        <!-- Bottom: settings + language -->
        <div class="sidebar-bottom" :class="{ 'sidebar-bottom-collapsed': collapsed }">
          <n-tooltip placement="right" :delay="300">
            <template #trigger>
              <div class="icon-btn" @click="settingsModalRef?.show()">
                <n-icon size="20" :component="SettingsOutline" />
              </div>
            </template>
            {{ t('common.settings') }}
          </n-tooltip>
          <LanguageSwitcher />
        </div>
      </n-layout-sider>

      <!-- ── Main content area (full width; sidebar floats above it) ── -->
      <n-layout class="main-layout" :bordered="false" :style="{ paddingLeft: collapsed ? '72px' : (pinned ? '240px' : '72px') }">
        <!-- Frosted header: fixed to the viewport, starts at the sidebar's right edge.
             position:fixed (not sticky) — the Naive layout's overflow:hidden ancestor
             would otherwise let it scroll away with the content. -->
        <n-layout-header :bordered="false" class="apple-header" :style="{ left: (collapsed ? 72 : 240) + 'px' }">
          <span class="header-title">{{ pageTitle }}</span>
        </n-layout-header>
        <n-layout-content content-style="padding: 76px 24px 24px;" class="apple-content">
          <router-view />
        </n-layout-content>

        <!-- Backend offline overlay -->
        <transition name="apple-material">
          <div v-if="!backendOnline" class="offline-overlay apple-glass">
            <div class="offline-card" :class="{ 'offline-card-dark': isDark }">
              <div class="offline-icon-wrap">
                <n-icon size="40" :component="CloudOfflineOutline" class="offline-icon" />
              </div>
              <div class="offline-title">{{ t('app.backendOffline') }}</div>
              <div class="offline-desc">{{ t('app.backendOfflineDesc', { url: settings.backendUrl }) }}</div>
            </div>
          </div>
        </transition>
      </n-layout>
    </n-layout>
  </div>
  <SettingsModal ref="settingsModalRef" />
  <ErrorModal />
  <JobProgressDrawer />
</template>

<script setup lang="ts">
import { ref, computed, h, Component, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NIcon } from 'naive-ui'
import { useTheme } from '@/stores/theme'
import { useSettings } from '@/stores/settings'
import { getSystemStatus } from '@/api/system'
import { setupGlobalPolling } from '@/composables/usePagePolling'
import SettingsModal from '@/components/SettingsModal.vue'
import ErrorModal from '@/components/error/ErrorModal.vue'
import JobProgressDrawer from '@/components/JobProgressDrawer.vue'
import LanguageSwitcher from '@/components/LanguageSwitcher.vue'
import { useI18n } from '@/stores/i18n'
import {
  SpeedometerOutline,
  PeopleOutline,
  ServerOutline,
  ConstructOutline,
  ListOutline,
  ShieldCheckmarkOutline,
  KeyOutline,
  FingerPrintOutline,
  GitCommitOutline,
  SettingsOutline,
  CloudOfflineOutline,
  Pin,
  PinOutline,
} from '@vicons/ionicons5'

const route = useRoute()
const router = useRouter()
const { isDark } = useTheme()
const { settings, backendOnline } = useSettings()
const { t } = useI18n()

// Sidebar: collapsed by default, auto-expands on hover, can be pinned via the header toggle
const collapsed = ref(true)
const pinned = ref(false)
let hoverTimer: ReturnType<typeof setTimeout> | null = null

function onSiderEnter() {
  if (pinned.value) return
  if (hoverTimer) clearTimeout(hoverTimer)
  // small delay so moving the pointer across the rail doesn't flap the sidebar
  hoverTimer = setTimeout(() => { collapsed.value = false }, 120)
}

function onSiderLeave() {
  if (pinned.value) return
  if (hoverTimer) clearTimeout(hoverTimer)
  collapsed.value = true
}

function togglePin() {
  pinned.value = !pinned.value
  if (pinned.value) {
    // pin → keep expanded
    collapsed.value = false
  }
  // unpin → leave it as-is; the natural mouseleave collapses it
}

const settingsModalRef = ref<InstanceType<typeof SettingsModal> | null>(null)

// Chrome bug workaround: backdrop-filter on a layer whose ancestor animates transform
// keeps a stale compositing layer (drawer content appears offset until a repaint).
// Enable the glass blur only AFTER the drawer slide-in (300ms) settles; drop it on close.
let drawerGlassTimer: ReturnType<typeof setTimeout> | null = null
let drawerObserver: MutationObserver | null = null

function syncDrawerGlass() {
  const hasDrawer = !!document.querySelector('.n-drawer')
  if (hasDrawer && !document.body.classList.contains('drawer-glass')) {
    if (drawerGlassTimer) clearTimeout(drawerGlassTimer)
    drawerGlassTimer = setTimeout(() => document.body.classList.add('drawer-glass'), 360)
  } else if (!hasDrawer && document.body.classList.contains('drawer-glass')) {
    if (drawerGlassTimer) clearTimeout(drawerGlassTimer)
    document.body.classList.remove('drawer-glass')
  }
}

function startDrawerObserver() {
  syncDrawerGlass()
  drawerObserver = new MutationObserver(syncDrawerGlass)
  drawerObserver.observe(document.body, { childList: true, subtree: true })
}

function stopDrawerObserver() {
  drawerObserver?.disconnect()
  drawerObserver = null
  if (drawerGlassTimer) clearTimeout(drawerGlassTimer)
  document.body.classList.remove('drawer-glass')
}

// Global health check — ensures every page shows the correct backend connection state
let healthTimer: ReturnType<typeof setInterval> | null = null
let consecutiveFailures = 0

async function checkHealth() {
  try {
    await getSystemStatus()
    consecutiveFailures = 0
    backendOnline.value = true
  } catch (e: any) {
    const status = e.response?.status
    const isUnreachable = !e.response || e.code === 'ERR_NETWORK' || status === 0

    if (!isUnreachable) {
      consecutiveFailures = 0
      backendOnline.value = true
      return
    }
    consecutiveFailures++
    if (consecutiveFailures >= 5) {
      backendOnline.value = false
    }
  }
}

function startHealthCheck() {
  if (healthTimer) clearInterval(healthTimer)
  checkHealth()
  healthTimer = setInterval(checkHealth, settings.value.pollInterval)
}

onMounted(() => {
  startHealthCheck()
  startDrawerObserver()
})
onUnmounted(() => {
  if (healthTimer) clearInterval(healthTimer)
  stopDrawerObserver()
})
watch(() => settings.value.pollInterval, () => startHealthCheck())

setupGlobalPolling(() => route.path)

const currentRoute = computed(() => route.name as string)

const pageTitle = computed(() => {
  const key = route.name as string
  if (!key) return 'ChordPanel'
  return t(`menu.${key}`)
})

function renderIcon(icon: Component) {
  return () => h(NIcon, null, { default: () => h(icon) })
}

const menuOptions = computed(() => [
  { label: t('menu.dashboard'), key: 'dashboard', icon: renderIcon(SpeedometerOutline) },
  { label: t('menu.users'), key: 'users', icon: renderIcon(PeopleOutline) },
  { label: t('menu.nodes'), key: 'nodes', icon: renderIcon(ServerOutline) },
  { label: t('menu.algorithms'), key: 'algorithms', icon: renderIcon(ConstructOutline) },
  { label: t('menu.jobs'), key: 'jobs', icon: renderIcon(ListOutline) },
  { label: t('menu.audit'), key: 'audit', icon: renderIcon(ShieldCheckmarkOutline) },
  { label: t('menu.ownership'), key: 'ownership', icon: renderIcon(KeyOutline) },
  { label: t('menu.identity'), key: 'identity', icon: renderIcon(FingerPrintOutline) },
  { label: t('menu.events'), key: 'events', icon: renderIcon(GitCommitOutline) },
])

function handleMenuClick(key: string) {
  router.push({ name: key })
}
</script>

<style scoped>
/* ── Frosted glass sidebar ── */
.apple-sidebar {
  background: rgba(255, 255, 255, 0.5) !important;
  backdrop-filter: blur(40px) saturate(180%);
  -webkit-backdrop-filter: blur(40px) saturate(180%);
  border-right: 1px solid rgba(0, 0, 0, 0.06);
  box-shadow: 8px 0 24px rgba(0, 0, 0, 0.04);
  z-index: 200;
  transition: width 400ms var(--apple-spring, cubic-bezier(0.32, 0.72, 0, 1));
}
.app-dark .apple-sidebar {
  /* macOS dark sidebar is a notch lighter than the content area (#2a2a2c vs #1e1e1e) */
  background: rgba(44, 44, 46, 0.62) !important;
  border-right-color: rgba(255, 255, 255, 0.08);
  box-shadow: 8px 0 24px rgba(0, 0, 0, 0.2);
}

/* ── Logo area ── */
.logo-area {
  height: 56px;
  display: flex;
  align-items: center;
  padding: 0 20px;
  gap: 10px;
  overflow: hidden;
}
.logo-collapsed {
  justify-content: center;
  padding: 0;
}
.logo-img {
  width: 30px;
  height: 30px;
  object-fit: contain;
  border-radius: 7px;
  flex-shrink: 0;
}
.logo-text {
  font-size: 17px;
  font-weight: 700;
  color: var(--apple-gray-1);
  letter-spacing: -0.02em;
  white-space: nowrap;
}

/* ── Pin button (sits on the expanded sidebar, next to the logo) ── */
.pin-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  margin-left: auto;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--apple-gray-3);
  cursor: pointer;
  transition:
    background 200ms var(--apple-ease-out, ease-out),
    color 200ms var(--apple-ease-out, ease-out),
    transform 120ms var(--apple-ease-out, ease-out);
}
.pin-btn:hover {
  background: rgba(0, 0, 0, 0.05);
  color: var(--apple-gray-1);
}
.pin-btn:active {
  transform: scale(0.92);
}
.pin-btn-active,
.pin-btn-active:hover {
  background: rgba(0, 113, 227, 0.1);
  color: var(--apple-blue, #0071E3);
}
.app-dark .pin-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--apple-gray-1);
}
.app-dark .pin-btn-active,
.app-dark .pin-btn-active:hover {
  background: rgba(10, 132, 255, 0.14);
  color: var(--apple-blue, #0A84FF);
}

/* ── Navigation ── */
.apple-nav {
  padding: 8px 12px;
}

/* ── Bottom bar ── */
.sidebar-bottom {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 52px;
  display: flex;
  align-items: center;
  padding: 0 16px;
  gap: 8px;
  border-top: 1px solid rgba(0, 0, 0, 0.04);
  overflow: hidden;
}
.app-dark .sidebar-bottom {
  border-top-color: rgba(255, 255, 255, 0.04);
}
.sidebar-bottom-collapsed {
  flex-direction: column;
  justify-content: center;
  height: 80px;
  padding: 8px 0;
  gap: 8px;
}

/* ── Icon button (settings) ── */
.icon-btn {
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  color: var(--apple-gray-3);
  flex-shrink: 0;
  transition:
    background 200ms var(--apple-ease-out, ease-out),
    color 200ms var(--apple-ease-out, ease-out),
    transform 120ms var(--apple-ease-out, ease-out);
}
.icon-btn:hover {
  background: rgba(0, 0, 0, 0.05);
  color: var(--apple-gray-1);
}
.icon-btn:active {
  transform: scale(0.92);
}
.app-dark .icon-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--apple-gray-1);
}

/* ── Frosted header ── */
.apple-header {
  height: 52px;
  padding: 0 28px;
  display: flex;
  align-items: center;
  background: var(--apple-header) !important;
  backdrop-filter: blur(40px) saturate(180%);
  -webkit-backdrop-filter: blur(40px) saturate(180%);
  border-bottom: 1px solid rgba(0, 0, 0, 0.04);
  position: fixed;
  top: 0;
  right: 0;
  width: auto !important; /* Naive sets 100%, which would overflow past the right edge */
  z-index: 100;
  /* slides with the floating sidebar; fixed keeps it frozen while content scrolls */
  transition: left 400ms var(--apple-spring, cubic-bezier(0.32, 0.72, 0, 1));
}
.app-dark .apple-header {
  border-bottom-color: rgba(255, 255, 255, 0.04);
}
.header-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--apple-gray-1);
  letter-spacing: -0.01em;
}

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
  background: transparent !important;
}

/* ── Offline overlay ── */
.offline-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  backdrop-filter: blur(20px) saturate(150%);
  -webkit-backdrop-filter: blur(20px) saturate(150%);
  background: rgba(0, 0, 0, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}
.app-dark .offline-overlay {
  background: rgba(0, 0, 0, 0.4);
}

.offline-card {
  text-align: center;
  padding: 40px 56px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(40px) saturate(180%);
  -webkit-backdrop-filter: blur(40px) saturate(180%);
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  box-shadow: var(--apple-shadow-xl, 0 20px 60px rgba(0, 0, 0, 0.12));
}
.offline-card-dark {
  background: rgba(44, 44, 46, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.offline-icon-wrap {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: rgba(255, 59, 48, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px;
}

.offline-icon {
  color: #FF3B30;
}

.offline-title {
  font-size: 17px;
  font-weight: 600;
  color: var(--apple-gray-1);
  margin-bottom: 6px;
}

.offline-desc {
  font-size: 13px;
  color: var(--apple-gray-3);
  font-family: var(--apple-font-mono, monospace);
}

/* ── Fade transition for logo text ── */
.apple-fade-enter-active,
.apple-fade-leave-active {
  transition: opacity 200ms var(--apple-ease-out, ease-out);
}
.apple-fade-enter-from,
.apple-fade-leave-to {
  opacity: 0;
}

/* ── Override Naive UI internal sidebar styles ── */
:deep(.n-layout-sider-scroll-container) {
  padding-bottom: 52px !important;
}

:deep(.n-layout-toggle-button) {
  display: none !important;
}

:deep(.n-menu .n-menu-item-content) {
  border-radius: 10px !important;
  margin-bottom: 2px !important;
}

/* Collapsed: Naive centers the icon itself via paddingLeft = collapsedWidth/2 - iconSize/2.
   Our container padding breaks that formula — drop it while collapsed and let Naive center. */
:deep(.n-layout-sider--collapsed .apple-nav) {
  padding-left: 0 !important;
  padding-right: 0 !important;
}

/* Collapsed hover highlight: inset from the rail edges so it frames the icon snugly.
   Offset the padding compensation: Naive's inline paddingLeft (25px) assumes a 72px
   rail; with 7px margins the content box is 58px, so keep the icon centered with 18px. */
:deep(.n-layout-sider--collapsed .n-menu .n-menu-item-content) {
  margin-left: 7px !important;
  margin-right: 7px !important;
  padding-left: 18px !important;
}

:deep(.n-menu .n-menu-item-content--selected) {
  background: rgba(0, 113, 227, 0.08) !important;
  color: var(--apple-blue, #0071E3) !important;
}
:deep(.n-menu .n-menu-item-content--selected .n-menu-item-content-header) {
  color: var(--apple-blue, #0071E3) !important;
  font-weight: 600;
}
:deep(.n-menu .n-menu-item-content--selected .n-menu-item-icon) {
  color: var(--apple-blue, #0071E3) !important;
}
.app-dark :deep(.n-menu .n-menu-item-content--selected) {
  background: rgba(10, 132, 255, 0.14) !important;
}
.app-dark :deep(.n-menu .n-menu-item-content--selected .n-menu-item-content-header) {
  color: var(--apple-blue, #0A84FF) !important;
}
.app-dark :deep(.n-menu .n-menu-item-content--selected .n-menu-item-icon) {
  color: var(--apple-blue, #0A84FF) !important;
}

:deep(.n-menu .n-menu-item-content--selected::before) {
  display: none !important;
}

/* ── Language switcher icon styling ── */
.sidebar-bottom :deep(.lang-btn) {
  flex-shrink: 0;
}
</style>
