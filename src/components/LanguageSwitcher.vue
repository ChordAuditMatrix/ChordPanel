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
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  color: var(--apple-gray-3, #6E6E73);
  flex-shrink: 0;
  transition:
    background 200ms var(--apple-ease-out, ease-out),
    color 200ms var(--apple-ease-out, ease-out),
    transform 120ms var(--apple-ease-out, ease-out);
}
.lang-btn:hover {
  background: rgba(0, 0, 0, 0.05);
  color: var(--apple-gray-1, #1D1D1F);
}
.lang-btn:active {
  transform: scale(0.92);
}
.lang-btn-dark {
  color: var(--apple-gray-3, #8E8E93);
}
.lang-btn-dark:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--apple-gray-1, #F5F5F7);
}
</style>
