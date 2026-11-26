<script setup lang="ts">
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {onBeforeUnmount, onMounted, shallowRef, useTemplateRef} from 'vue'
import BoardLayers from './BoardLayers.vue'
import type {MapView} from '../board/model'
import {createTileLayer} from '../scripts/tile-layer'
import {MAP_LIMITS} from '../scripts/tiles'

/**
 * The Leaflet map of a board. The board's layers and tools attach once the map exists, and the map
 * follows every change of its container's size, such as a side panel being hidden.
 */
const props = defineProps<{ view: MapView }>()

const container = useTemplateRef<HTMLDivElement>('container')
const map = shallowRef<L.Map | null>(null)
let resizing: ResizeObserver | undefined

defineExpose({map})

onMounted(() => {
  if (!container.value) return
  const created = L.map(container.value, {...MAP_LIMITS, zoomControl: true, doubleClickZoom: false, keyboard: false})
      .setView(props.view.center, props.view.zoom)
  createTileLayer().addTo(created)
  map.value = created
  resizing = new ResizeObserver(() => created.invalidateSize())
  resizing.observe(container.value)
})

onBeforeUnmount(() => {
  resizing?.disconnect()
  map.value?.remove()
  map.value = null
})
</script>

<template>
  <div ref="container" class="board-map size-full">
    <BoardLayers v-if="map" :map="map"/>
  </div>
</template>

<style>
.board-map {
  isolation: isolate;
  background-color: var(--ui-bg-muted);
}

.board-map.is-placing {
  cursor: crosshair;
}

.board-found-place {
  fill: none;
  stroke: var(--color-signal-500);
  stroke-width: 4;
}

.board-map.is-placing .board-icon,
.board-map.is-placing .board-shape {
  pointer-events: none;
}

.board-icon {
  background: none;
  border: none;
}

.board-marker {
  --board-marker-size: var(--board-symbol, 48px);
  display: flex;
  flex-direction: column;
  align-items: center;
  width: max-content;
  min-width: var(--board-marker-size);
  transform: translate(-50%, calc(var(--board-marker-size) / -3));
}

.board-marker.is-to-scale {
  --board-marker-size: max(var(--board-symbol, 48px), calc(var(--board-length) * var(--board-symbol-per-metre, 0px)));
}

.board-marker-symbol {
  display: block;
  width: var(--board-marker-size);
  line-height: 0;
  filter: drop-shadow(0 1px 1px color-mix(in srgb, var(--color-black) 35%, transparent));
  position: relative;
  margin-bottom: calc(var(--board-turn-reach, 0) * (var(--board-marker-size) / 6 + 9px));
  transform: rotate(var(--board-turn, 0deg));
}

.board-marker-symbol svg {
  width: 100%;
  height: auto;
}

.board-marker-front {
  position: absolute;
  top: 47.5%;
  right: -9px;
  width: 0;
  height: 0;
  border-top: 7px solid transparent;
  border-bottom: 7px solid transparent;
  border-left: 9px solid var(--color-signal-500);
  transform: translateY(-50%);
}

.board-marker-symbol.faces-left .board-marker-front {
  right: auto;
  left: -9px;
  border-left: none;
  border-right: 9px solid var(--color-signal-500);
}

.board-marker-caption {
  font-family: var(--font-condensed);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.15;
  color: var(--color-steel-950);
  text-shadow: 0 0 2px var(--color-white), 0 0 2px var(--color-white), 0 0 3px var(--color-white);
  white-space: nowrap;
}

.board-marker.is-selected .board-marker-symbol {
  outline: 2px solid var(--eb-focus);
  outline-offset: 2px;
}

.board-text {
  width: max-content;
  max-width: 240px;
  padding: 2px 6px;
  font-family: var(--font-condensed);
  font-size: 14px;
  font-weight: 600;
  color: var(--color-steel-950);
  background-color: color-mix(in srgb, var(--color-white) 85%, transparent);
  border: 1px solid var(--color-steel-400);
  white-space: pre-wrap;
}

.board-text.is-selected {
  outline: 2px solid var(--eb-focus);
}

.board-icon.is-entering,
.board-shape.is-entering {
  animation: board-fade-in 800ms ease-out;
}

.board-icon.is-leaving,
.board-shape.is-leaving {
  opacity: 0;
  transition: opacity 800ms ease-in;
  pointer-events: none;
}

@keyframes board-fade-in {
  from {
    opacity: 0;
  }
}

.board-shape {
  stroke-width: 4;
}

.board-handle {
  border: 2px solid var(--color-steel-900);
  background-color: var(--color-white);
  box-shadow: 0 1px 2px color-mix(in srgb, var(--color-black) 35%, transparent);
}

.board-handle-corner {
  cursor: nwse-resize;
}

.board-handle-rotate {
  border-radius: 50%;
  cursor: grab;
}

.board-handle-move {
  border-radius: 50%;
  background-color: var(--color-steel-900);
  cursor: move;
}

.board-shape-label {
  padding: 1px 6px;
  font-family: var(--font-condensed);
  font-size: 13px;
  font-weight: 600;
  color: var(--color-steel-950);
  background-color: color-mix(in srgb, var(--color-white) 85%, transparent);
  border: 1px solid var(--color-steel-400);
  box-shadow: none;
  white-space: nowrap;
}

.board-shape-label::before {
  display: none;
}

.board-shape.is-selected {
  stroke-width: 6;
}

.board-line-hose {
  stroke: var(--color-signal-500);
}

.board-line-barrier {
  stroke: var(--color-signal-700);
  stroke-dasharray: 10 6;
}

.board-line-route {
  stroke: var(--color-steel-700);
  stroke-dasharray: 2 8;
  stroke-linecap: round;
}

.board-area {
  stroke-width: 3;
  fill-opacity: 0.25;
}

.board-area-danger {
  stroke: var(--color-signal-500);
  fill: var(--color-signal-500);
}

.board-area-sector {
  stroke: var(--color-steel-700);
  fill: var(--color-steel-400);
  stroke-dasharray: 12 6;
}

.board-area-staging {
  stroke: var(--color-steel-900);
  fill: var(--color-steel-300);
}
</style>
