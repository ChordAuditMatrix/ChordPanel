<template>
  <n-button
    class="execution-back-button"
    quaternary
    size="small"
    :aria-label="label"
    :title="label"
    @click="$emit('activate')"
  >
    <template #icon>
      <n-icon :component="ChevronBackOutline" size="20" />
    </template>
  </n-button>
</template>

<script setup lang="ts">
import { ChevronBackOutline } from '@vicons/ionicons5'

defineProps<{ label: string }>()
defineEmits<{ (event: 'activate'): void }>()
</script>

<style scoped>
.execution-back-button {
  align-self: flex-start;
  flex: none;
  min-width: 44px;
  min-height: 44px;
  padding: 0;
}
</style>
