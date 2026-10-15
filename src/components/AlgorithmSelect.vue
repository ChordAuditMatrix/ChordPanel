<template>
  <n-select
    :value="modelValue || null"
    :options="options"
    :loading="algorithmsState.loading"
    :placeholder="resolvedPlaceholder"
    filterable
    clearable
    :size="size"
    :style="style"
    @focus="ensureAlgorithmsLoaded"
    @update:value="onChange"
  />
</template>

<script setup lang="ts">
import { computed, watch, type CSSProperties } from 'vue'
import type { AlgorithmProfile } from '@/api/algorithm'
import { useI18n } from '@/stores/i18n'
import { useReferenceCatalog } from '@/stores/referenceCatalog'

const { t } = useI18n()
const { algorithmEntitiesById, algorithmsState, ensureAlgorithmsLoaded } = useReferenceCatalog()
const props = withDefaults(defineProps<{
  modelValue: string
  placeholder?: string
  size?: 'small' | 'medium' | 'large'
  style?: string | CSSProperties
  purpose?: string
}>(), { size: 'medium' })
const resolvedPlaceholder = computed(() => props.placeholder || t('common.selectAlgorithm'))
const emit = defineEmits<{ 'update:modelValue': [string], change: [profile: AlgorithmProfile | null] }>()
const options = computed(() => Array.from(algorithmEntitiesById.value.values())
  .filter(profile => !props.purpose || profile.purpose === props.purpose)
  .map(profile => ({ label: `${profile.algorithmName} (${profile.algorithmId.substring(0, 8)})`, value: profile.algorithmId })))
watch(() => [props.modelValue, props.purpose], () => { void ensureAlgorithmsLoaded() }, { immediate: true })
function onChange(value: string | null) {
  emit('update:modelValue', value ?? '')
  emit('change', value ? algorithmEntitiesById.value.get(value) ?? null : null)
}
</script>
