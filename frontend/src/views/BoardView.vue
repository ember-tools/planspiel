<script setup lang="ts">
import L from 'leaflet'
import {computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch} from 'vue'
import {useRoute} from 'vue-router'
import BoardMap from '../components/BoardMap.vue'
import AddressSearch from '../components/board/AddressSearch.vue'
import BoardPanel from '../components/board/BoardPanel.vue'
import DrawPanel from '../components/board/DrawPanel.vue'
import SnapshotPanel from '../components/board/SnapshotPanel.vue'
import SnapshotTimeline from '../components/board/SnapshotTimeline.vue'
import SyncStatus from '../components/board/SyncStatus.vue'
import UnitsPanel from '../components/board/UnitsPanel.vue'
import type {Place} from '../api/geocode'
import {usePresentation} from '../composables/usePresentation'
import {setBoardField} from '../board/edits'
import {inControl} from '../board/keys'
import type {LatLng} from '../board/model'
import {boardState, commit, loadViewerSettings, openLocalBoard, stepSnapshot} from '../board/store'
import {closeSharedBoard, openSharedBoard, syncState} from '../board/sync'
import {t} from '../i18n'

const route = useRoute()
const mapView = useTemplateRef<InstanceType<typeof BoardMap>>('mapView')
const tab = ref('units')
const stage = useTemplateRef<HTMLElement>('stage')
const {presenting, sidebar, start: present, stop: endPresentation, toggleSidebar} = usePresentation(stage, () => boardState.tool.kind === 'select')

const tabs = computed(() => [
  {label: t('board.tabUnits'), value: 'units', icon: 'i-lucide-truck', slot: 'units' as const},
  {label: t('board.tabSituation'), value: 'situation', icon: 'i-lucide-clipboard-list', slot: 'situation' as const},
  {label: t('board.tabDraw'), value: 'draw', icon: 'i-lucide-pen-tool', slot: 'draw' as const},
  {label: t('board.tabBoard'), value: 'board', icon: 'i-lucide-settings-2', slot: 'board' as const},
])

/** Arrow keys step through the snapshots, unless the focus is on a control that uses them. */
function onKey(event: KeyboardEvent): void {
  if (event.defaultPrevented || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return
  if (inControl(event)) return
  event.preventDefault()
  stepSnapshot(event.key === 'ArrowLeft' ? -1 : 1)
}

/** The token of a shared board in the address, or nothing for the board kept in this browser. */
const token = computed(() => typeof route.params.token === 'string' ? route.params.token : '')

/** A shared board that cannot be shown: gone, or never there. */
const unavailable = computed(() => token.value && (syncState.status === 'missing' || syncState.status === 'deleted'))

function open(): void {
  if (token.value) {
    openSharedBoard(token.value)
  } else {
    closeSharedBoard()
    openLocalBoard()
  }
}

onMounted(() => {
  loadViewerSettings()
  window.addEventListener('keydown', onKey)
})

watch(token, open, {immediate: true})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  closeSharedBoard()
})

function focus(position: LatLng): void {
  mapView.value?.map?.panTo(position)
}

const FOUND_ZOOM = 18
const FOUND_MARK_MS = 4000

/** Shows a found place: the map moves there and a ring marks it for a few seconds. */
function showPlace(place: Place): void {
  const map = mapView.value?.map
  if (!map) return
  map.setView([place.lat, place.lon], Math.max(map.getZoom(), FOUND_ZOOM))
  const ring = L.circleMarker([place.lat, place.lon], {radius: 18, className: 'board-found-place', interactive: false}).addTo(map)
  setTimeout(() => ring.remove(), FOUND_MARK_MS)
}

function saveView(): void {
  const map = mapView.value?.map
  if (!map) return
  const center = map.getCenter()
  commit(setBoardField('view', {center: [center.lat, center.lng], zoom: map.getZoom()}))
}
</script>

<template>
  <div v-if="unavailable" class="py-12 text-center">
    <h1 class="headline text-2xl">{{ syncState.status === 'deleted' ? t('sync.deletedTitle') : t('sync.missingTitle') }}</h1>
    <p class="text-muted">{{ t('sync.unavailableHint') }}</p>
    <UButton color="neutral" variant="outline" class="mt-4 inline-flex" to="/platte" :label="t('sync.toLocal')"/>
  </div>
  <div v-else-if="boardState.board" ref="stage" :class="['board-stage grid gap-4', presenting ? 'is-presenting' : '', sidebar ? 'lg:grid-cols-[minmax(0,1fr)_380px]' : '']">
    <div class="board-stage-main flex min-w-0 flex-col gap-2 lg:h-[calc(100dvh-11rem)]">
      <div class="board-stage-map relative h-[55dvh] min-h-80 overflow-hidden rounded-(--ui-radius) border border-default lg:h-auto lg:grow">
        <BoardMap ref="mapView" :key="boardState.generation" :view="boardState.board.view"/>
        <div class="pointer-events-none absolute top-2 right-2 left-12 z-10 flex items-start justify-between gap-2">
          <AddressSearch class="pointer-events-auto" @found="showPlace"/>
          <div v-if="presenting" class="pointer-events-auto flex shrink-0 gap-1">
            <UButton size="sm" color="neutral" variant="solid" :icon="sidebar ? 'i-lucide-panel-right-close' : 'i-lucide-panel-right-open'"
                     :aria-label="sidebar ? t('board.hideSidebar') : t('board.showSidebar')" :title="t('board.sidebarKey')" @click="toggleSidebar">
              <span class="hidden xl:inline">{{ sidebar ? t('board.hideSidebar') : t('board.showSidebar') }}</span>
            </UButton>
            <UButton size="sm" color="neutral" variant="solid" icon="i-lucide-minimize" :aria-label="t('board.endPresentation')" @click="endPresentation">
              <span class="hidden xl:inline">{{ t('board.endPresentation') }}</span>
            </UButton>
          </div>
        </div>
      </div>
      <SnapshotTimeline/>
    </div>
    <aside v-show="sidebar" class="board-stage-side flex min-w-0 flex-col gap-3 lg:h-[calc(100dvh-11rem)] lg:overflow-y-auto lg:overflow-x-hidden">
      <div class="flex items-center gap-2">
        <h1 class="headline m-0 min-w-0 grow truncate text-2xl">{{ boardState.board.title || t('board.untitled') }}</h1>
        <UButton v-if="!presenting" size="sm" color="neutral" variant="outline" icon="i-lucide-presentation" :label="t('board.present')" @click="present"/>
      </div>
      <SyncStatus v-if="token"/>
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
  <p v-else class="py-12 text-center text-muted">{{ t('sync.connecting') }}</p>
</template>

<style scoped>
.board-stage.is-presenting {
  position: fixed;
  inset: 0;
  overflow-y: auto;
  padding: 0.5rem;
  background-color: var(--ui-bg);
}

.board-stage.is-presenting .board-stage-main {
  height: 85dvh;
}

.board-stage.is-presenting .board-stage-map {
  height: auto;
  flex-grow: 1;
}

@media (width >= 64rem) {
  .board-stage.is-presenting {
    grid-template-rows: minmax(0, 1fr);
    overflow-y: hidden;
  }

  .board-stage.is-presenting .board-stage-main,
  .board-stage.is-presenting .board-stage-side {
    height: 100%;
  }
}
</style>
