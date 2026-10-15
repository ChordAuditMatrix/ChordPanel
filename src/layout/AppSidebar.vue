<template>
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
  >
    <!-- Logo + pin (pin only makes sense while expanded) -->
    <div class="logo-area" :class="{ 'logo-collapsed': collapsed }">
      <img src="/logo.png" alt="logo" class="logo-img" />
      <transition name="apple-fade">
        <span v-if="!collapsed" class="logo-text">{{ t('app.name') }}</span>
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

    <AppNavMenu :collapsed="collapsed" :value="activeRoute" @select="navigate" />

    <!-- Bottom: settings + language -->
    <div class="sidebar-bottom" :class="{ 'sidebar-bottom-collapsed': collapsed }">
      <n-tooltip placement="right" :delay="300">
        <template #trigger>
          <button type="button" class="icon-btn" :aria-label="t('common.settings')" @click="emit('open-settings')">
            <n-icon size="20" :component="SettingsOutline" />
          </button>
        </template>
        {{ t('common.settings') }}
      </n-tooltip>
      <LanguageSwitcher />
    </div>
  </n-layout-sider>
</template>

<script setup lang="ts">
import { computed, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NIcon, NLayoutSider, NTooltip } from 'naive-ui'
import { Pin, PinOutline, SettingsOutline } from '@vicons/ionicons5'
import AppNavMenu from './AppNavMenu.vue'
import LanguageSwitcher from '@/components/LanguageSwitcher.vue'
import { useI18n } from '@/stores/i18n'

/** Collapsed rail / pinned-open state, owned by the layout (it also offsets the content). */
const collapsed = defineModel<boolean>('collapsed', { required: true })
const pinned = defineModel<boolean>('pinned', { required: true })

const emit = defineEmits<{ 'open-settings': [] }>()

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const activeRoute = computed(() => (route.name ? String(route.name) : null))

/*
 * Auto-expand on hover. The timer delays expansion so that moving the pointer
 * across the collapsed rail does not flap the sidebar.
 */
const HOVER_EXPAND_DELAY = 120

let hoverTimer: number | null = null

function clearHoverTimer() {
  if (hoverTimer !== null) {
    clearTimeout(hoverTimer)
    hoverTimer = null
  }
}

function onSiderEnter() {
  if (pinned.value) return
  clearHoverTimer()
  hoverTimer = window.setTimeout(() => { collapsed.value = false }, HOVER_EXPAND_DELAY)
}

function onSiderLeave() {
  if (pinned.value) return
  clearHoverTimer()
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

function navigate(key: string) {
  router.push({ name: key })
}

onUnmounted(clearHoverTimer)
</script>

<style scoped>
/* ── Frosted glass sidebar ── */
.apple-sidebar {
  border-right: 1px solid rgba(0, 0, 0, 0.06);
  box-shadow: 8px 0 24px rgba(0, 0, 0, 0.04);
  z-index: 200;
  transition: width 400ms var(--apple-spring, cubic-bezier(0.32, 0.72, 0, 1));
}
.app-dark .apple-sidebar {
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
  padding: 0;
  border: 0;
  background: transparent;
  font: inherit;
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

/* ── Language switcher icon styling ── */
.sidebar-bottom :deep(.lang-btn) {
  flex-shrink: 0;
}
</style>
