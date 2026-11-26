<script setup lang="ts">
import {computed, onMounted, ref, useTemplateRef} from 'vue'
import BoardMap from '../components/BoardMap.vue'
import BoardPanel from '../components/board/BoardPanel.vue'
import DrawPanel from '../components/board/DrawPanel.vue'
import UnitsPanel from '../components/board/UnitsPanel.vue'
import {setBoardField} from '../board/edits'
import type {LatLng} from '../board/model'
import {boardState, commit, openLocalBoard} from '../board/store'
import {t} from '../i18n'

const mapView = useTemplateRef<InstanceType<typeof BoardMap>>('mapView')
const tab = ref('units')

const tabs = computed(() => [
  {label: t('board.tabUnits'), value: 'units', icon: 'i-lucide-truck', slot: 'units' as const},
  {label: t('board.tabDraw'), value: 'draw', icon: 'i-lucide-pen-tool', slot: 'draw' as const},
  {label: t('board.tabBoard'), value: 'board', icon: 'i-lucide-settings-2', slot: 'board' as const},
])

onMounted(openLocalBoard)

function focus(position: LatLng): void {
  const map = mapView.value?.map
  if (map) map.panTo(position)
}

function saveView(): void {
  const map = mapView.value?.map
  if (!map) return
  const center = map.getCenter()
  commit(setBoardField('view', {center: [center.lat, center.lng], zoom: map.getZoom()}))
}
</script>

<template>
  <div v-if="boardState.board" class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
    <div class="h-[60dvh] min-h-96 overflow-hidden rounded-(--ui-radius) border border-default lg:h-[calc(100dvh-11rem)]">
      <BoardMap ref="mapView" :key="boardState.generation" :view="boardState.board.view"/>
    </div>
    <aside class="flex min-w-0 flex-col gap-3 lg:h-[calc(100dvh-11rem)] lg:overflow-y-auto lg:overflow-x-hidden">
      <h1 class="headline m-0 truncate text-2xl">{{ boardState.board.title || t('board.untitled') }}</h1>
      <UTabs v-model="tab" :items="tabs" class="w-full" :ui="{content: 'pt-2'}">
        <template #units>
          <UnitsPanel @focus="focus"/>
        </template>
        <template #draw>
          <DrawPanel/>
        </template>
        <template #board>
          <BoardPanel @save-view="saveView"/>
        </template>
      </UTabs>
    </aside>
  </div>
</template>
