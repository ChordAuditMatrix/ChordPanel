<template>
  <n-config-provider :theme="theme" :locale="naiveLocale" :date-locale="naiveDateLocale">
    <n-message-provider>
      <n-dialog-provider>
        <n-notification-provider>
          <router-view />
        </n-notification-provider>
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { zhCN, dateZhCN, enUS, dateEnUS } from 'naive-ui'
import { useTheme } from '@/stores/theme'
import { useI18n } from '@/stores/i18n'

const { theme } = useTheme()
const { locale } = useI18n()

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
