<template>
  <math class="math-expression" display="inline" :aria-label="label">
    <msub>
      <mi>P</mi>
      <mtext>detect</mtext>
    </msub>
    <mo>=</mo>
    <mn>1</mn>
    <mo>−</mo>
    <mfrac>
      <mrow>
        <mo stretchy="true">(</mo>
        <mfrac linethickness="0">
          <mrow><mi>N</mi><mo>−</mo><mi>t</mi></mrow>
          <mi>c</mi>
        </mfrac>
        <mo stretchy="true">)</mo>
      </mrow>
      <mrow>
        <mo stretchy="true">(</mo>
        <mfrac linethickness="0">
          <mi>N</mi>
          <mi>c</mi>
        </mfrac>
        <mo stretchy="true">)</mo>
      </mrow>
    </mfrac>
  </math>
</template>

<script setup lang="ts">
defineProps<{
  /** Spoken description of the formula for assistive technology. */
  label: string
}>()
</script>

<style scoped>
.math-expression {
  font-family: inherit;
  font-size: 1em;
}
</style>
