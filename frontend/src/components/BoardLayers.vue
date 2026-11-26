<script setup lang="ts">
import type L from 'leaflet'
import {useBoardLayers} from '../board/map-layers'
import {useMapTools} from '../board/map-tools'

/** Attaches the board's layers and tools to a map for as long as this component lives. */
const props = defineProps<{ map: L.Map }>()

useBoardLayers(props.map)
useMapTools(props.map)
</script>

<template>
  <span hidden/>
</template>
