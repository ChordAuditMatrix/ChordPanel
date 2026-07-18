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
import { getUsers } from '@/api/user'
import type { User } from '@/api/user'
import { useI18n } from '@/stores/i18n'

const { t } = useI18n()

const props = withDefaults(defineProps<{
  modelValue: string
  placeholder?: string
  size?: 'small' | 'medium' | 'large'
  style?: string | CSSProperties
}>(), { size: 'medium' })

const resolvedPlaceholder = computed(() => props.placeholder || t('common.selectUser'))

const emit = defineEmits<{ 'update:modelValue': [string], change: [user: User | null] }>()

const users = ref<User[]>([])
const loading = ref(false)
const loaded = ref(false)

const options = computed(() => users.value.map(u => ({
  label: `${u.userName} (${u.userId})`,
  value: u.userId,
})))

async function loadUsers() {
  if (loaded.value) return
  loading.value = true
  try {
    const res = await getUsers({ pageSize: 1000 })
    users.value = ((res as any)?.items ?? []) as User[]
    loaded.value = true
  } catch { /* ignore */ } finally {
    loading.value = false
  }
}

// Load on first open
watch(() => props.modelValue, () => { if (!loaded.value) loadUsers() }, { immediate: true })

function onChange(val: string) {
  emit('update:modelValue', val)
  const u = users.value.find(x => x.userId === val) || null
  emit('change', u)
}
</script>
