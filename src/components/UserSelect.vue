<template>
  <n-select
    :value="modelValue || null"
    :options="options"
    :loading="usersState.loading"
    :placeholder="resolvedPlaceholder"
    filterable
    clearable
    :size="size"
    :style="style"
    @focus="ensureUsersLoaded"
    @update:value="onChange"
  />
</template>

<script setup lang="ts">
import { computed, watch, type CSSProperties } from 'vue'
import type { User } from '@/api/user'
import { useI18n } from '@/stores/i18n'
import { useReferenceCatalog } from '@/stores/referenceCatalog'

const { t } = useI18n()
const { userEntitiesById, usersState, ensureUsersLoaded } = useReferenceCatalog()
const props = withDefaults(defineProps<{
  modelValue: string
  placeholder?: string
  size?: 'small' | 'medium' | 'large'
  style?: string | CSSProperties
}>(), { size: 'medium' })
const resolvedPlaceholder = computed(() => props.placeholder || t('common.selectUser'))
const emit = defineEmits<{ 'update:modelValue': [string], change: [user: User | null] }>()
const options = computed(() => Array.from(userEntitiesById.value.values(), user => ({ label: `${user.userName} (${user.userId})`, value: user.userId })))
watch(() => props.modelValue, () => { void ensureUsersLoaded() }, { immediate: true })
function onChange(val: string | null) {
  emit('update:modelValue', val ?? '')
  emit('change', val ? userEntitiesById.value.get(val) ?? null : null)
}
</script>
