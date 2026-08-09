<template>
  <n-config-provider :theme="theme" :theme-overrides="themeOverrides" :locale="naiveLocale" :date-locale="naiveDateLocale">
    <n-message-provider>
      <n-dialog-provider>
        <n-notification-provider>
          <router-view v-slot="{ Component }">
            <transition name="apple-page" mode="out-in">
              <component :is="Component" />
            </transition>
          </router-view>
        </n-notification-provider>
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { zhCN, dateZhCN, enUS, dateEnUS } from 'naive-ui'
import { useTheme } from '@/stores/theme'
import { useI18n } from '@/stores/i18n'
import { lightThemeOverrides, darkThemeOverrides } from '@/styles/apple-theme'
import '@/styles/apple-global.css'

const { isDark, theme } = useTheme()
const { locale } = useI18n()

// Keep <html> in sync so the --apple-* CSS variables flip at the :root level
// (body background is driven by var(--apple-bg), no JS color needed)
watch(
  isDark,
  (dark) => {
    document.documentElement.classList.toggle('app-dark', dark)
  },
  { immediate: true },
)

const themeOverrides = computed(() => isDark.value ? darkThemeOverrides : lightThemeOverrides)
const naiveLocale = computed(() => locale.value === 'zh-CN' ? zhCN : enUS)
const naiveDateLocale = computed(() => locale.value === 'zh-CN' ? dateZhCN : dateEnUS)
</script>

<style>
body {
  margin: 0;
  padding: 0;
}

/* Center buttons inside form-items without a label */
.n-form-item--no-label .n-form-item-blank {
  justify-content: center;
}
</style>
