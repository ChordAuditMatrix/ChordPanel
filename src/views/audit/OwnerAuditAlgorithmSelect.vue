<template>
  <div class="owner-algorithm">
    <n-select
      :value="modelValue || null"
      :options="options"
      :loading="state === 'loading'"
      :disabled="!ownerId.trim()"
      :placeholder="resolvedPlaceholder"
      :status="state === 'error' ? 'error' : undefined"
      filterable
      clearable
      :size="size"
      :style="style"
      :aria-describedby="describedBy || hintId"
      @focus="load"
      @update:value="onChange"
    />
    <p v-if="!ownerId.trim()" :id="hintId" class="owner-algorithm__hint">
      {{ t('audit.workbench.maintenance.bindingOwnerFirst') }}
    </p>
    <p v-else-if="state === 'loading'" :id="hintId" class="owner-algorithm__hint" role="status">
      {{ t('audit.workbench.maintenance.bindingLoading') }}
    </p>
    <p v-else-if="state === 'error'" :id="hintId" class="owner-algorithm__hint owner-algorithm__hint--error" role="alert">
      {{ t('audit.workbench.maintenance.bindingError') }}
      <n-button text size="tiny" type="primary" @click="load">{{ t('audit.workbench.maintenance.bindingRetry') }}</n-button>
    </p>
    <p v-else-if="options.length === 0" :id="hintId" class="owner-algorithm__hint owner-algorithm__hint--warning" role="status">
      {{ t('audit.workbench.maintenance.bindingEmpty') }}
    </p>
    <p v-else :id="hintId" class="owner-algorithm__hint">
      {{ t('audit.workbench.maintenance.bindingCount', { count: options.length }) }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, useId, watch, type CSSProperties } from 'vue'
import { NButton, NSelect } from 'naive-ui'
import { getBindings } from '@/api/algorithm'
import { useI18n } from '@/stores/i18n'
import { useReferenceCatalog } from '@/stores/referenceCatalog'
import { readOwnerAuditBindingPage, type OwnerAuditBinding } from './auditMaintenance'

const { t } = useI18n()
const { algorithmEntitiesById, ensureAlgorithmsLoaded } = useReferenceCatalog()

const props = withDefaults(defineProps<{
  ownerId: string
  modelValue: string
  placeholder?: string
  describedBy?: string
  size?: 'small' | 'medium' | 'large'
  style?: string | CSSProperties
}>(), { size: 'medium' })

const resolvedPlaceholder = computed(() =>
  props.placeholder || t('audit.workbench.maintenance.algorithmPlaceholder'))
const emit = defineEmits<{ 'update:modelValue': [string] }>()

const hintId = `owner-audit-algorithm-${useId()}`
const state = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
const bindings = ref<OwnerAuditBinding[]>([])
let sequence = 0

const options = computed(() => bindings.value.map(binding => {
  const profile = algorithmEntitiesById.value.get(binding.algorithmId)
  const name = profile?.algorithmName?.trim() || binding.algorithmId
  const type = profile?.algorithmType?.trim()
  const version = binding.algorithmVersion === null ? '' : `v${binding.algorithmVersion}`
  const meta = [type, version].filter(Boolean).join(' · ')
  return {
    label: meta ? `${name} (${meta})` : name,
    value: binding.algorithmId,
  }
}))

async function load(): Promise<void> {
  const ownerId = props.ownerId.trim()
  const current = ++sequence
  if (!ownerId) {
    bindings.value = []
    state.value = 'idle'
    return
  }
  state.value = 'loading'
  try {
    void ensureAlgorithmsLoaded()
    const response = await getBindings({ userId: ownerId, purpose: 'Audit', page: 1, pageSize: 1000 })
    const first = readOwnerAuditBindingPage(response, ownerId)
    if (!first) throw new TypeError('Invalid owner Audit binding page')
    const items = [...first.items]
    for (let page = 2; page <= first.totalPages; page++) {
      const pageResponse = await getBindings({ userId: ownerId, purpose: 'Audit', page, pageSize: 1000 })
      const parsed = readOwnerAuditBindingPage(pageResponse, ownerId)
      if (!parsed) throw new TypeError('Invalid owner Audit binding page')
      if (parsed.items.length === 0) break
      items.push(...parsed.items)
    }
    if (current !== sequence) return
    const seen = new Set<string>()
    bindings.value = items.filter(binding => {
      if (seen.has(binding.algorithmId)) return false
      seen.add(binding.algorithmId)
      return true
    })
    state.value = 'ready'
    if (props.modelValue && !bindings.value.some(binding => binding.algorithmId === props.modelValue)) {
      emit('update:modelValue', '')
    }
  } catch {
    if (current !== sequence) return
    bindings.value = []
    state.value = 'error'
  }
}

watch(() => props.ownerId, () => { void load() }, { immediate: true })

function onChange(value: string | null): void {
  emit('update:modelValue', value ?? '')
}
</script>

<style scoped>
.owner-algorithm {
  display: flex;
  flex-direction: column;
  gap: var(--apple-space-1, 4px);
  min-width: 0;
}
.owner-algorithm__hint {
  margin: 0;
  color: var(--apple-gray-4);
  font-size: 12px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.owner-algorithm__hint--error {
  color: var(--apple-red);
}
.owner-algorithm__hint--warning {
  color: var(--apple-orange, #c93400);
}
</style>
