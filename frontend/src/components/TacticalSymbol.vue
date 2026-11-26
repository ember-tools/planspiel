<script setup lang="ts">
defineProps<{
  /** The SVG markup of the symbol, from `symbols/tactical.ts` or `symbols/units.ts`. */
  svg: string
  /** Width in pixels; the height follows the symbol's aspect ratio. */
  width?: number
}>()
</script>

<template>
  <span class="tactical-symbol" :style="{width: `${width ?? 48}px`}" v-html="svg"/>
</template>

<style scoped>
.tactical-symbol {
  display: inline-block;
  line-height: 0;
}

.tactical-symbol :deep(svg) {
  width: 100%;
  height: auto;
}
</style>
