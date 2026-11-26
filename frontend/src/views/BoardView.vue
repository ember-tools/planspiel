<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref, useTemplateRef} from 'vue'
import BoardMap from '../components/BoardMap.vue'
import BoardPanel from '../components/board/BoardPanel.vue'
import DrawPanel from '../components/board/DrawPanel.vue'
import SnapshotPanel from '../components/board/SnapshotPanel.vue'
import SnapshotTimeline from '../components/board/SnapshotTimeline.vue'
import UnitsPanel from '../components/board/UnitsPanel.vue'
import {setBoardField} from '../board/edits'
import type {LatLng} from '../board/model'
import {boardState, commit, loadViewerSettings, openLocalBoard, stepSnapshot} from '../board/store'
import {t} from '../i18n'

const mapView = useTemplateRef<InstanceType<typeof BoardMap>>('mapView')
const tab = ref('units')

const tabs = computed(() => [
  {label: t('board.tabUnits'), value: 'units', icon: 'i-lucide-truck', slot: 'units' as const},
  {label: t('board.tabSituation'), value: 'situation', icon: 'i-lucide-clipboard-list', slot: 'situation' as const},
  {label: t('board.tabDraw'), value: 'draw', icon: 'i-lucide-pen-tool', slot: 'draw' as const},
  {label: t('board.tabBoard'), value: 'board', icon: 'i-lucide-settings-2', slot: 'board' as const},
])

/** Places where arrow keys belong to the control in focus. */
const INTERACTIVE = [
  'input', 'textarea', 'select', '[contenteditable="true"]', '[role="dialog"]', '[role="listbox"]',
  '[role="tab"]', '[role="menu"]', '[role="menuitem"]', '[role="combobox"]', '[role="slider"]',
  '[role="radiogroup"]', '[role="switch"]',
].join(', ')

/** Arrow keys step through the snapshots, unless the focus is on a control that uses them. */
function onKey(event: KeyboardEvent): void {
  if (event.defaultPrevented || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return
  const target = event.target as HTMLElement | null
  if (target?.closest(INTERACTIVE)) return
  event.preventDefault()
  stepSnapshot(event.key === 'ArrowLeft' ? -1 : 1)
}

onMounted(() => {
  loadViewerSettings()
  openLocalBoard()
  window.addEventListener('keydown', onKey)
})

onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

function focus(position: LatLng): void {
  mapView.value?.map?.panTo(position)
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
    <div class="flex min-w-0 flex-col gap-2 lg:h-[calc(100dvh-11rem)]">
      <div class="h-[55dvh] min-h-80 overflow-hidden rounded-(--ui-radius) border border-default lg:h-auto lg:grow">
        <BoardMap ref="mapView" :key="boardState.generation" :view="boardState.board.view"/>
      </div>
      <SnapshotTimeline/>
    </div>
    <aside class="flex min-w-0 flex-col gap-3 lg:h-[calc(100dvh-11rem)] lg:overflow-y-auto lg:overflow-x-hidden">
      <h1 class="headline m-0 truncate text-2xl">{{ boardState.board.title || t('board.untitled') }}</h1>
      <UTabs v-model="tab" :items="tabs" size="sm" class="w-full" :ui="{content: 'pt-2', trigger: 'px-1.5 gap-1', label: 'overflow-visible'}">
        <template #units>
          <UnitsPanel @focus="focus"/>
        </template>
        <template #situation>
          <SnapshotPanel/>
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
