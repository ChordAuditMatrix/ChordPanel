<template>
  <math class="math-symbol" display="inline" :aria-label="ariaLabel">
    <msub v-if="sub">
      <mi>{{ base }}</mi>
      <mtext v-if="roman">{{ sub }}</mtext>
      <mi v-else>{{ sub }}</mi>
    </msub>
    <mi v-else>{{ base }}</mi>
  </math>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  /** Variable letter, e.g. `P`, `p`, `N`. */
  base: string
  /** Subscript; `detect` stays upright, single letters stay italic. */
  sub?: string
  /** Whether the subscript is a word rather than a variable. */
  roman?: boolean
}>(), { sub: '', roman: true })

const ariaLabel = computed(() => props.sub ? `${props.base} ${props.sub}` : props.base)
</script>

<style scoped>
.math-symbol {
  font-family: inherit;
  font-size: 1em;
  white-space: nowrap;
}
</style>
