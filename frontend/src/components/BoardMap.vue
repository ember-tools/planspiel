<script setup lang="ts">
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {onBeforeUnmount, onMounted, shallowRef, useTemplateRef} from 'vue'
import {DEFAULT_CENTER, DEFAULT_ZOOM, MAP_LIMITS, TILE_LAYER_OPTIONS, TILE_URL} from '../scripts/tiles'

const container = useTemplateRef<HTMLDivElement>('container')
const map = shallowRef<L.Map | null>(null)

defineExpose({map})

onMounted(() => {
  if (!container.value) return
  const created = L.map(container.value, {...MAP_LIMITS, zoomControl: true})
      .setView(DEFAULT_CENTER, DEFAULT_ZOOM)
  L.tileLayer(TILE_URL, TILE_LAYER_OPTIONS).addTo(created)
  map.value = created
})

onBeforeUnmount(() => {
  map.value?.remove()
  map.value = null
})
</script>

<template>
  <div ref="container" class="board-map size-full"/>
</template>

<style scoped>
.board-map {
  background-color: var(--ui-bg-muted);
}
</style>
