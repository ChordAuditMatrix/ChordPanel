<template>
  <n-select
    :value="modelValue"
    :options="options"
    :loading="loading"
    :placeholder="resolvedPlaceholder"
    filterable
    clearable
    :size="size"
    :style="style"
    @update:value="onChange"
  />
</template>

<script setup lang="ts">
import { ref, computed, watch, type CSSProperties } from 'vue'
import { getProfiles } from '@/api/algorithm'
import type { AlgorithmProfile } from '@/api/algorithm'
import { useI18n } from '@/stores/i18n'

const { t } = useI18n()

const props = withDefaults(defineProps<{
  modelValue: string
  placeholder?: string
  size?: 'small' | 'medium' | 'large'
  style?: string | CSSProperties
  purpose?: string
}>(), { size: 'medium' })

const emit = defineEmits<{ 'update:modelValue': [string], change: [profile: AlgorithmProfile | null] }>()

const resolvedPlaceholder = computed(() => props.placeholder || t('common.selectAlgorithm'))

const profiles = ref<AlgorithmProfile[]>([])
const loading = ref(false)
const loaded = ref(false)

const options = computed(() => profiles.value.map(p => ({
  label: `${p.algorithmName} (${p.algorithmId.substring(0, 8)})`,
  value: p.algorithmId,
})))

async function loadProfiles() {
  if (loaded.value) return
  loading.value = true
  try {
    const res = await getProfiles({ pageSize: 1000, purpose: props.purpose })
    profiles.value = ((res as any)?.items ?? []) as AlgorithmProfile[]
    loaded.value = true
  } catch { /* ignore */ } finally {
    loading.value = false
  }
}

watch(() => props.modelValue, () => { if (!loaded.value) loadProfiles() }, { immediate: true })

function onChange(val: string) {
  emit('update:modelValue', val)
  const p = profiles.value.find(x => x.algorithmId === val) || null
  emit('change', p)
}
</script>
