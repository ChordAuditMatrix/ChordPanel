<template>
  <aside
    id="app-sidebar"
    class="apple-sidebar app-sidebar"
    :class="{
      'app-sidebar--mobile': mobile,
      'app-sidebar--mobile-open': mobile && mobileOpen,
    }"
    :style="{ width: `${sidebarWidth}px` }"
    :role="mobile ? 'dialog' : undefined"
    :aria-modal="mobile && mobileOpen ? 'true' : undefined"
    :aria-label="mobile ? t('app.name') : undefined"
    :inert="mobile && !mobileOpen"
  >
    <div class="sidebar-content">
      <!-- Logo. On narrow screens this bar doubles as the drawer header. -->
      <div class="logo-area" :class="{ 'logo-collapsed': isRail }">
        <img src="/logo.png" alt="logo" class="logo-img" />
        <transition name="apple-fade">
          <span v-if="!isRail" class="logo-text">{{ t('app.name') }}</span>
        </transition>
        <button
          v-if="mobile"
          ref="mobileCloseButton"
          type="button"
          class="icon-btn close-btn"
          :aria-label="t('common.closeNavigation')"
          :title="t('common.closeNavigation')"
          @click="closeMobile()"
        >
          <n-icon size="20" :component="CloseOutline" />
        </button>
      </div>

      <div id="app-sidebar-nav" class="sidebar-navigation">
        <NScrollbar trigger="none" class="sidebar-nav-scroll">
          <transition name="sidebar-menu" mode="out-in">
            <AppNavMenu
              :key="isRail ? 'collapsed' : 'expanded'"
              :collapsed="isRail"
              :value="activeRoute"
              @select="navigate"
            />
          </transition>
        </NScrollbar>
      </div>

      <!-- Bottom controls keep settings, theme, and locale available on every route. -->
      <div class="sidebar-bottom" :class="{ 'sidebar-bottom-collapsed': isRail }">
        <n-tooltip placement="right" :delay="300">
          <template #trigger>
            <button type="button" class="icon-btn" :aria-label="t('common.settings')" @click="openSettings">
              <n-icon size="20" :component="SettingsOutline" />
            </button>
          </template>
          {{ t('common.settings') }}
        </n-tooltip>
        <n-tooltip placement="right" :delay="300">
          <template #trigger>
            <button
              type="button"
              class="icon-btn"
              :aria-label="themeToggleLabel"
              :title="themeToggleLabel"
              @click="toggleTheme"
            >
              <n-icon size="20" :component="themeToggleIcon" />
            </button>
          </template>
          {{ themeToggleLabel }}
        </n-tooltip>
        <LanguageSwitcher />
        <n-tooltip v-if="!mobile" placement="right" :delay="300">
          <template #trigger>
            <button
              type="button"
              class="icon-btn sidebar-toggle"
              :aria-label="sidebarToggleLabel"
              :aria-expanded="!collapsed"
              aria-controls="app-sidebar"
              @click="toggleSidebar"
            >
              <n-icon size="19" :component="toggleIcon" />
            </button>
          </template>
          {{ sidebarToggleLabel }}
        </n-tooltip>
      </div>
    </div>
  </aside>

  <transition name="sidebar-backdrop">
    <div v-if="mobile && mobileOpen" class="sidebar-backdrop" aria-hidden="true" @click="closeMobile()" />
  </transition>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NIcon, NScrollbar, NTooltip } from 'naive-ui'
import {
  ChevronBackOutline,
  ChevronForwardOutline,
  CloseOutline,
  MoonOutline,
  SettingsOutline,
  SunnyOutline,
} from '@vicons/ionicons5'
import AppNavMenu from './AppNavMenu.vue'
import LanguageSwitcher from '@/components/LanguageSwitcher.vue'
import { useI18n } from '@/stores/i18n'
import { useTheme } from '@/stores/theme'

/** Expanded/collapsed desktop widths and the narrow-screen drawer width. */
const MOBILE_NAV_WIDTH = 280
/** The topbar menu button owns this id; closing the drawer returns focus to it. */
const NAV_TRIGGER_ID = 'app-nav-trigger'

const props = withDefaults(
  defineProps<{
    /** Expanded desktop width in px. */
    width?: number
    /** Icon-rail width in px. */
    collapsedWidth?: number
    /** Narrow viewport: render as an off-canvas drawer instead of a docked rail. */
    mobile?: boolean
  }>(),
  { width: 240, collapsedWidth: 72, mobile: false },
)

/** Collapsed rail state, owned by the layout (it also offsets the content). */
const collapsed = defineModel<boolean>('collapsed', { required: true })
/** Narrow-screen drawer visibility, owned by the layout so the topbar can open it. */
const mobileOpen = defineModel<boolean>('open', { required: true })

const emit = defineEmits<{ 'open-settings': [] }>()

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const { isDark, toggleTheme } = useTheme()
const themeToggleLabel = computed(() => t(isDark.value ? 'common.switchToLight' : 'common.switchToDark'))
const themeToggleIcon = computed(() => isDark.value ? SunnyOutline : MoonOutline)

const mobileCloseButton = ref<HTMLButtonElement | null>(null)

const activeRoute = computed(() => (route.name ? String(route.name) : null))
const isRail = computed(() => !props.mobile && collapsed.value)
const sidebarWidth = computed(() =>
  props.mobile ? MOBILE_NAV_WIDTH : collapsed.value ? props.collapsedWidth : props.width,
)
const toggleIcon = computed(() => (collapsed.value ? ChevronForwardOutline : ChevronBackOutline))
const sidebarToggleLabel = computed(() =>
  t(collapsed.value ? 'common.expandSidebar' : 'common.collapseSidebar')
)

function toggleSidebar() {
  collapsed.value = !collapsed.value
}

function closeMobile(restoreFocus = true) {
  mobileOpen.value = false
  if (!restoreFocus) return
  // Keyboard focus must not fall back to the inert page behind the drawer.
  nextTick(() => document.getElementById(NAV_TRIGGER_ID)?.focus())
}

function openSettings() {
  if (!props.mobile || !mobileOpen.value) {
    emit('open-settings')
    return
  }
  // Close the drawer first and hand focus back to the topbar trigger, so the
  // settings dialog has a visible element to restore focus to when it closes.
  closeMobile(false)
  nextTick(() => {
    document.getElementById(NAV_TRIGGER_ID)?.focus()
    emit('open-settings')
  })
}

function navigate(key: string) {
  // Selecting the current route does not change the URL, so close explicitly.
  if (props.mobile) closeMobile()
  router.push({ name: key })
}

function onWindowKeydown(event: KeyboardEvent) {
  if (!props.mobile || !mobileOpen.value) return
  if (event.key === 'Escape') {
    event.preventDefault()
    closeMobile()
  }
}

// Move focus into the drawer as soon as it opens.
watch(
  () => props.mobile && mobileOpen.value,
  (open) => {
    if (open) nextTick(() => mobileCloseButton.value?.focus())
  },
)

onMounted(() => window.addEventListener('keydown', onWindowKeydown))
onUnmounted(() => window.removeEventListener('keydown', onWindowKeydown))
</script>

<style scoped>
/* ── Docked sidebar ── */
.app-sidebar {
  position: fixed;
  inset: 0 auto 0 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  border-right: 1px solid rgba(0, 0, 0, 0.06);
  box-shadow: 8px 0 24px rgba(0, 0, 0, 0.04);
  z-index: 200;
  overflow: hidden;
  transition: width var(--apple-dur) var(--apple-spring);
}
.app-dark .app-sidebar {
  border-right-color: rgba(255, 255, 255, 0.08);
  box-shadow: 8px 0 24px rgba(0, 0, 0, 0.2);
}

/* ── Narrow-screen drawer ── */
.app-sidebar--mobile {
  top: 0;
  bottom: auto;
  height: 100vh;
  height: 100dvh;
  max-width: 86vw;
  z-index: 1201;
  transform: translateX(-100%);
  visibility: hidden;
  border-right: none;
  box-shadow: var(--apple-shadow-lg, 0 12px 40px rgba(0, 0, 0, 0.1));
  transition:
    transform var(--apple-dur) var(--apple-spring),
    visibility 0s linear var(--apple-dur);
}
.app-sidebar--mobile.app-sidebar--mobile-open {
  transform: translateX(0);
  visibility: visible;
  transition:
    transform var(--apple-dur) var(--apple-spring),
    visibility 0s linear 0s;
}

.sidebar-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1200;
  background: var(--apple-material-scrim, rgba(0, 0, 0, 0.22));
}
.sidebar-backdrop-enter-active,
.sidebar-backdrop-leave-active {
  transition: opacity var(--apple-dur) var(--apple-ease-out);
}
.sidebar-backdrop-enter-from,
.sidebar-backdrop-leave-to {
  opacity: 0;
}

/* ── Logo area ── */
.logo-area {
  height: 56px;
  display: flex;
  align-items: center;
  padding: 0 16px;
  gap: 10px;
  overflow: hidden;
  flex-shrink: 0;
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
.close-btn {
  margin-left: auto;
}

/* ── Bottom bar ── */
.sidebar-bottom {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  gap: 6px;
  border-top: 1px solid rgba(0, 0, 0, 0.04);
  overflow: hidden;
  flex-shrink: 0;
}
.app-dark .sidebar-bottom {
  border-top-color: rgba(255, 255, 255, 0.04);
}
.sidebar-bottom-collapsed {
  flex-direction: column;
  justify-content: center;
  padding: 8px 0;
  gap: 4px;
}
.sidebar-toggle {
  margin-left: auto;
}
.sidebar-bottom-collapsed .sidebar-toggle {
  margin-left: 0;
}

/* ── Icon buttons (settings / drawer close / rail toggle) ── */
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
    background var(--apple-dur-fast) var(--apple-ease-out),
    color var(--apple-dur-fast) var(--apple-ease-out),
    transform var(--apple-dur-fast) var(--apple-ease-out);
}
.icon-btn:hover {
  background: rgba(0, 0, 0, 0.05);
  color: var(--apple-gray-1);
}
.icon-btn:active {
  transform: scale(0.97);
}
.icon-btn:focus-visible {
  outline: 2px solid var(--apple-blue, #0071e3);
  outline-offset: 2px;
}
.app-dark .icon-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--apple-gray-1);
}

/* The rail width already animates; fade/translate the menu when its structure switches between grouped and flat. */
.sidebar-menu-enter-active,
.sidebar-menu-leave-active {
  transition:
    opacity var(--apple-dur-fast) var(--apple-ease-out),
    transform var(--apple-dur-fast) var(--apple-ease-out);
}
.sidebar-menu-enter-from,
.sidebar-menu-leave-to {
  opacity: 0;
  transform: translateX(-6px);
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

/* Keep the sider fixed; the navigation scrolls independently of the footer. */
.sidebar-content {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.sidebar-navigation {
  position: relative;
  flex: 1;
  min-height: 0;
}

.sidebar-nav-scroll {
  height: 100%;
}

/* ── Language switcher icon styling ── */
.sidebar-bottom :deep(.lang-btn) {
  flex-shrink: 0;
}

@media (prefers-reduced-motion: reduce) {
  .app-sidebar,
  .app-sidebar--mobile,
  .app-sidebar--mobile.app-sidebar--mobile-open,
  .sidebar-backdrop-enter-active,
  .sidebar-backdrop-leave-active,
  .sidebar-menu-enter-active,
  .sidebar-menu-leave-active,
  .apple-fade-enter-active,
  .apple-fade-leave-active {
    transition: none;
  }
}
</style>
