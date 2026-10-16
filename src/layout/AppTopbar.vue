<template>
  <n-layout-header :bordered="false" class="apple-header" :style="{ left: `${offset}px` }">
    <div class="header-crumbs">
      <template v-if="group">
        <span class="header-group">{{ group }}</span>
        <n-icon size="12" :component="ChevronForwardOutline" class="crumb-sep" />
      </template>
      <span class="header-title" aria-current="page">{{ title }}</span>
    </div>
  </n-layout-header>
</template>

<script setup lang="ts">
import { NIcon, NLayoutHeader } from 'naive-ui'
import { ChevronForwardOutline } from '@vicons/ionicons5'

defineProps<{
  /** Current page name, already localized. */
  title: string
  /** Workflow group the page belongs to; omitted for routes outside the sidebar. */
  group?: string | null
  /** Left edge in px — the fixed header follows the floating sidebar. */
  offset: number
}>()
</script>

<style scoped>
/* Frosted header: fixed to the viewport, starts at the sidebar's right edge.
   position:fixed (not sticky) — the Naive layout's overflow:hidden ancestor
   would otherwise let it scroll away with the content. */
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
  /* slides with the floating sidebar; fixed keeps it frozen while content scrolls */
  transition: left var(--apple-dur) var(--apple-spring);
}
.app-dark .apple-header {
  border-bottom-color: rgba(255, 255, 255, 0.04);
}

.header-crumbs {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.header-group {
  font-size: 13px;
  color: var(--apple-gray-3);
  white-space: nowrap;
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

@media (max-width: 640px) {
  .apple-header {
    padding: 0 16px;
  }
}
</style>
