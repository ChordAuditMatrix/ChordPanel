<template>
  <n-layout-header :bordered="false" class="apple-header" :style="{ left: `${offset}px` }">
    <button
      v-if="mobile"
      id="app-nav-trigger"
      type="button"
      class="nav-trigger"
      :aria-label="t(navOpen ? 'common.closeNavigation' : 'common.openNavigation')"
      :aria-expanded="navOpen"
      aria-haspopup="dialog"
      aria-controls="app-sidebar"
      @click="$emit('open-nav')"
    >
      <n-icon size="20" :component="MenuOutline" />
    </button>

    <div class="header-crumbs">
      <template v-if="group">
        <span class="header-group">{{ group }}</span>
        <n-icon size="12" :component="ChevronForwardOutline" class="crumb-sep" />
      </template>
      <span class="header-title" aria-current="page">{{ title }}</span>
    </div>
    <button
      type="button"
      class="progress-trigger"
      :aria-label="progressButtonLabel"
      :title="progressButtonLabel"
      @click="$emit('open-job-progress')"
    >
      <n-icon size="16" :component="CubeOutline" aria-hidden="true" />
      <span>{{ t('jobProgress.title') }}</span>
      <span v-if="runningTrackedCount > 0" class="progress-count" aria-hidden="true">{{ badgeCount }}</span>
    </button>
    <span class="sr-only" role="status" aria-live="polite" aria-atomic="true">{{ countAnnouncement }}</span>
  </n-layout-header>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NIcon, NLayoutHeader } from 'naive-ui'
import { ChevronForwardOutline, CubeOutline, MenuOutline } from '@vicons/ionicons5'
import { useI18n } from '@/stores/i18n'
import { useJobTracking } from '@/stores/jobTracking'

defineProps<{
  /** Current page name, already localized. */
  title: string
  /** Workflow group the page belongs to; omitted for routes outside the sidebar. */
  group?: string | null
  /** Left edge in px — matches the content offset of the docked sidebar. */
  offset: number
  /** Narrow viewport: expose the navigation drawer trigger. */
  mobile?: boolean
  /** Whether the mobile drawer is currently open (announced via aria-expanded). */
  navOpen?: boolean
}>()

defineEmits<{ 'open-nav': []; 'open-job-progress': [] }>()

const { t } = useI18n()
const { runningTrackedCount } = useJobTracking()
const badgeCount = computed(() => runningTrackedCount.value > 99 ? '99+' : String(runningTrackedCount.value))
const progressButtonLabel = computed(() => runningTrackedCount.value > 0
  ? t('jobProgress.titleWithRunningCount', { count: runningTrackedCount.value })
  : t('jobProgress.title'))
const countAnnouncement = ref('')
watch(runningTrackedCount, (count, previous) => {
  if (previous === undefined) return
  countAnnouncement.value = count > 0
    ? t('jobProgress.runningCountAnnouncement', { count })
    : t('jobProgress.noRunningAnnouncement')
})
</script>

<style scoped>
/* Fixed header aligns to the sidebar edge and stays visible while the content scrolls. */
.apple-header {
  height: 52px;
  padding: 0 28px;
  display: flex;
  align-items: center;
  border-bottom: 1px solid rgba(0, 0, 0, 0.04);
  position: fixed;
  top: 0;
  right: 0;
  width: auto !important; /* Naive sets 100%, which would overflow past the right edge */
  z-index: 100;
  /* slides with the docked sidebar; fixed keeps it frozen while content scrolls */
  transition: left var(--apple-dur) var(--apple-spring);
}
.app-dark .apple-header {
  border-bottom-color: rgba(255, 255, 255, 0.04);
}

/* ── Mobile navigation trigger ── */
.nav-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  margin-right: 10px;
  padding: 0;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--apple-gray-3);
  font: inherit;
  cursor: pointer;
  flex-shrink: 0;
  transition:
    background var(--apple-dur-fast) var(--apple-ease-out),
    color var(--apple-dur-fast) var(--apple-ease-out);
}
@media (hover: hover) and (pointer: fine) {
  .nav-trigger:hover {
    background: rgba(0, 0, 0, 0.05);
    color: var(--apple-gray-1);
  }
  .app-dark .nav-trigger:hover {
    background: rgba(255, 255, 255, 0.08);
    color: var(--apple-gray-1);
  }
}
.nav-trigger:focus-visible {
  outline: 2px solid var(--apple-blue, #0071e3);
  outline-offset: 2px;
}

.header-crumbs {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1;
  overflow: hidden;
}
.progress-trigger {
  position: relative;
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  max-width: 150px;
  margin-left: 12px;
  padding: 0 9px;
  border: 1px solid var(--apple-border);
  border-radius: 8px;
  background: var(--apple-card);
  color: var(--apple-gray-2);
  font: inherit;
  font-size: 11px;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color var(--apple-dur-fast) var(--apple-ease-out);
}

.progress-trigger span {
  overflow: hidden;
  text-overflow: ellipsis;
}

.progress-count {
  position: absolute;
  top: -7px;
  right: -7px;
  display: flex;
  min-width: 18px;
  height: 18px;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
  border: 1px solid var(--apple-card);
  border-radius: 999px;
  background: var(--apple-blue);
  box-shadow: 0 0 0 1px var(--apple-border);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 16px;
  overflow: visible !important;
  text-overflow: clip !important;
}

.app-dark .progress-count {
  color: #152033;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}


.progress-trigger:hover {
  background: color-mix(in srgb, var(--apple-gray-6) 55%, var(--apple-card));
}

.progress-trigger:focus-visible {
  outline: 2px solid var(--apple-blue, #0071e3);
  outline-offset: 2px;
}

.header-group {
  font-size: 13px;
  color: var(--apple-gray-3);
  white-space: nowrap;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.crumb-sep {
  color: var(--apple-gray-5);
  flex-shrink: 0;
}

.header-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--apple-gray-1);
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (max-width: 900px) {
  .apple-header {
    padding: 0 14px;
  }
}

@media (max-width: 640px) {
  .apple-header {
    padding: 0 12px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .apple-header {
    transition: none;
  }
}
</style>
