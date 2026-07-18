<template>
  <div class="app-layout" :class="{ 'app-dark': isDark }">
    <n-layout has-sider style="height: 100vh">
      <n-layout-sider
        bordered
        collapse-mode="width"
        :collapsed-width="64"
        :width="220"
        :collapsed="collapsed"
        show-trigger
        :native-scrollbar="false"
        style="z-index: 200;"
        @collapse="collapsed = true"
        @expand="collapsed = false"
      >
      <div class="logo" :class="{ 'logo-dark': isDark }">
        <img src="/logo.png" alt="logo" class="logo-img" />
        <span v-if="!collapsed" class="logo-text">ChordPanel</span>
      </div>
      <n-menu
        :collapsed="collapsed"
        :collapsed-width="64"
        :collapsed-icon-size="22"
        :options="menuOptions"
        :value="currentRoute"
        @update:value="handleMenuClick"
      />
      <!-- Bottom-left gear + language switcher (stacked vertically when collapsed, horizontal when expanded) -->
      <div class="sidebar-bottom" :class="{ 'sidebar-bottom-collapsed': collapsed }">
        <n-tooltip placement="right" :delay="300">
          <template #trigger>
            <div class="settings-btn" @click="settingsModalRef?.show()">
              <n-icon size="20" :component="SettingsOutline" />
            </div>
          </template>
          {{ t('common.settings') }}
        </n-tooltip>
        <LanguageSwitcher />
      </div>
    </n-layout-sider>
    <n-layout class="main-layout">
      <n-layout-header bordered style="height: 48px; padding: 0 24px; display: flex; align-items: center;">
        <span class="header-title" :class="{ 'header-title-dark': isDark }">{{ pageTitle }}</span>
      </n-layout-header>
      <n-layout-content content-style="padding: 24px;">
        <router-view />
      </n-layout-content>
      <!-- Backend offline glass overlay: covers header + content, leaves the left sidebar interactive -->
      <div v-if="!backendOnline" class="offline-overlay">
        <div class="offline-card" :class="{ 'offline-card-dark': isDark }">
          <n-icon size="48" :component="CloudOfflineOutline" class="offline-icon" />
          <div class="offline-title">{{ t('app.backendOffline') }}</div>
          <div class="offline-desc">{{ t('app.backendOfflineDesc', { url: settings.backendUrl }) }}</div>
        </div>
      </div>
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
} from '@vicons/ionicons5'

const route = useRoute()
const router = useRouter()
const { isDark } = useTheme()
const { settings, backendOnline } = useSettings()
const { t } = useI18n()
const collapsed = ref(false)
const settingsModalRef = ref<InstanceType<typeof SettingsModal> | null>(null)

// Global health check — ensures every page shows the correct backend connection state
// Key: only real network unreachability marks offline; HTTP errors (401/404/500 etc.) mean the backend is "online"
let healthTimer: ReturnType<typeof setInterval> | null = null
let consecutiveFailures = 0

async function checkHealth() {
  try {
    await getSystemStatus()
    consecutiveFailures = 0
    backendOnline.value = true
  } catch (e: any) {
    const status = e.response?.status
    // 502 is a vite proxy error (not backend unreachable), ignore it
    // Only real no-response (ERR_NETWORK) counts as a failure
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

onMounted(() => startHealthCheck())
onUnmounted(() => { if (healthTimer) clearInterval(healthTimer) })
watch(() => settings.value.pollInterval, () => startHealthCheck())

// Install global page polling: switching routes auto-triggers the corresponding page's data refresh
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
.logo {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-bottom: 1px solid #e8e8e8;
}
.logo-dark {
  border-bottom-color: rgba(255, 255, 255, 0.09);
}
.logo-img {
  width: 28px;
  height: 28px;
  object-fit: contain;
}
.logo-text {
  font-size: 18px;
  font-weight: 700;
  color: #18a058;
  letter-spacing: 1px;
}
.logo-text-short {
  font-size: 18px;
  font-weight: 700;
  color: #18a058;
}
.header-title {
  font-size: 15px;
  color: #606266;
}
.header-title-dark {
  color: rgba(255,255,255,0.7);
}

/* Bottom-left gear */
.sidebar-bottom {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 48px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  border-top: 1px solid rgba(0,0,0,0.06);
  gap: 10px;
  overflow: hidden;
}

/* Collapsed state: stacked vertically, centered */
.sidebar-bottom-collapsed {
  flex-direction: column;
  justify-content: center;
  height: 72px;
  padding: 8px 0;
  gap: 6px;
}

.settings-btn {
  cursor: pointer;
  opacity: 0.5;
  transition: opacity 0.2s;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.settings-btn:hover {
  opacity: 1;
}

/* LanguageSwitcher displays inline in collapsed mode without overflowing */
.sidebar-bottom :deep(.lang-btn) {
  flex-shrink: 0;
}

/* Sidebar toggle button - uses theme accent color for visibility */
:deep(.n-layout-toggle-button) {
  background-color: #18a058 !important;
  color: #fff !important;
}

:deep(.n-layout-toggle-button:hover) {
  background-color: #36ad6a !important;
}

.app-dark :deep(.n-layout-toggle-button) {
  background-color: #63e2b7 !important;
  color: #000 !important;
}

.app-dark :deep(.n-layout-toggle-button:hover) {
  background-color: #7ce7c3 !important;
}

/* Right main area serves as the positioning context for the overlay */
.main-layout {
  position: relative;
}

/* Backend offline overlay: covers header + content, leaves the left sidebar interactive */
.offline-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

.offline-card {
  text-align: center;
  padding: 32px 48px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.offline-card-dark {
  background: rgba(40, 40, 40, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.offline-icon {
  color: #E88080;
  margin-bottom: 12px;
}

.offline-title {
  font-size: 18px;
  font-weight: 700;
  margin-bottom: 8px;
}

.offline-desc {
  font-size: 13px;
  opacity: 0.5;
  font-family: monospace;
}
</style>
