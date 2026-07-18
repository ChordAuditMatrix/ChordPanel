<template>
  <n-dropdown trigger="click" placement="top-end" :options="dropdownOptions" @select="onSelect">
    <n-tooltip placement="right" :delay="300">
      <template #trigger>
        <div class="lang-btn" :class="{ 'lang-btn-dark': isDark }">
          <n-icon size="20" :component="GlobeOutline" />
        </div>
      </template>
      {{ t('common.language') }}
    </n-tooltip>
  </n-dropdown>
</template>

<script setup lang="ts">
import { computed, h } from 'vue'
import { NIcon, NDropdown, NTooltip } from 'naive-ui'
import { CheckmarkOutline, GlobeOutline } from '@vicons/ionicons5'
import { useI18n, LOCALES, type LocaleKey } from '@/stores/i18n'
import { useTheme } from '@/stores/theme'

const { locale, setLocale, t } = useI18n()
const { isDark } = useTheme()

const dropdownOptions = computed(() =>
  LOCALES.map(l => ({
    label: l.label,
    key: l.key,
    icon: l.key === locale.value ? () => h(NIcon, { component: CheckmarkOutline, size: 14 }) : undefined,
  }))
)

function onSelect(key: string) {
  setLocale(key as LocaleKey)
}
</script>

<style scoped>
.lang-btn {
  cursor: pointer;
  opacity: 0.5;
  transition: opacity 0.2s;
  display: flex;
  align-items: center;
}
.lang-btn:hover {
  opacity: 1;
}
.lang-btn-dark {
  color: rgba(255, 255, 255, 0.7);
}
</style>
