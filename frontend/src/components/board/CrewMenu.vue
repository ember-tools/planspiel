<script setup lang="ts">
import L from 'leaflet'
import {computed, onBeforeUnmount, ref, useTemplateRef, watch} from 'vue'
import {crewOf, setCrewDismounted, squadLabel, toggleSquad, vehicleOfSquad} from '../../board/edits'
import {DEFAULT_HEADING} from '../../board/markers'
import {boardState, commit, currentSnapshot, select} from '../../board/store'
import {squadFunction} from '../../catalog'
import {t} from '../../i18n'

/**
 * A small panel on the map next to the selected vehicle or dismounted squad: a vehicle's squads
 * dismount or mount one by one or all at once, a dismounted squad mounts again. It shows only to
 * editors with the select tool in hand, and clicks on it never reach the map below.
 *
 * It sits behind the vehicle, away from the turning handle in front, and moves to the other side
 * or inwards where the map ends. Its place is measured from the drawn marker on every frame, so it
 * keeps up with markers that are dragged, animated, turned or drawn to scale.
 */
const props = defineProps<{ map: L.Map }>()

const GAP = 12
const EDGE = 8
const TOP_CLEARANCE = 56

const menu = useTemplateRef<HTMLElement>('menu')
const place = ref<{left: number, top: number} | null>(null)
let frame = 0

/** What the panel is about: the selected vehicle on scene or the selected dismounted squad. */
const subject = computed(() => {
  const board = boardState.board
  const snapshot = currentSnapshot.value
  const selection = boardState.selection
  if (!board || !snapshot || !selection || boardState.readOnly || boardState.tool.kind !== 'select') return null
  if (selection.kind === 'vehicle') {
    const placed = snapshot.vehicles[selection.id]
    const vehicle = board.vehicles[selection.id]
    if (!placed || !vehicle) return null
    const squads = crewOf(vehicle).map(squad => ({
      id: squad.id,
      name: squadLabel(squad),
      dismounted: Object.hasOwn(snapshot.squads, squad.id),
    }))
    return {kind: 'vehicle' as const, id: vehicle.id, title: vehicle.callsign, heading: placed.heading ?? DEFAULT_HEADING, squads}
  }
  if (selection.kind === 'squad') {
    const vehicle = vehicleOfSquad(board, selection.id)
    const squad = vehicle?.squads[selection.id]
    if (!snapshot.squads[selection.id] || !vehicle || !squad) return null
    return {kind: 'squad' as const, id: squad.id, vehicleId: vehicle.id, title: `${squadFunction(squad.function).short} · ${vehicle.callsign}`, heading: DEFAULT_HEADING}
  }
  return null
})

/** Where the panel goes: behind the marker, else in front of it, always inside the map. */
function measure(): void {
  frame = requestAnimationFrame(measure)
  const container = props.map.getContainer()
  const symbol = container.querySelector<HTMLElement>('.board-marker.is-selected .board-marker-symbol')
  const element = menu.value
  const zooming = props.map.getPane('mapPane')?.classList.contains('leaflet-zoom-anim')
  const bounds = container.getBoundingClientRect()
  const marker = symbol?.getBoundingClientRect()
  const visible = marker && marker.right > bounds.left && marker.left < bounds.right
    && marker.bottom > bounds.top && marker.top < bounds.bottom
  if (!subject.value || !marker || !visible || zooming) {
    place.value = null
    return
  }
  const width = element?.offsetWidth || 224
  const height = element?.offsetHeight || 120
  const behind = Math.sin(subject.value.heading * Math.PI / 180) >= 0
  const leftSide = marker.left - bounds.left - GAP - width
  const rightSide = marker.right - bounds.left + GAP
  const fitsLeft = leftSide >= EDGE
  const fitsRight = rightSide + width <= bounds.width - EDGE
  const left = (behind ? fitsLeft || !fitsRight : !fitsRight && fitsLeft) ? leftSide : rightSide
  const top = marker.top - bounds.top
  const next = {
    left: Math.round(Math.min(Math.max(left, EDGE), Math.max(EDGE, bounds.width - width - EDGE))),
    top: Math.round(Math.min(Math.max(top, TOP_CLEARANCE), Math.max(TOP_CLEARANCE, bounds.height - height - EDGE))),
  }
  if (next.left !== place.value?.left || next.top !== place.value?.top) place.value = next
}

watch(() => subject.value !== null, shown => {
  cancelAnimationFrame(frame)
  if (shown) frame = requestAnimationFrame(measure)
  else place.value = null
}, {immediate: true})

watch(menu, element => {
  if (!element) return
  L.DomEvent.disableClickPropagation(element)
  L.DomEvent.disableScrollPropagation(element)
})

onBeforeUnmount(() => cancelAnimationFrame(frame))

function switchSquad(squadId: string): void {
  const board = boardState.board
  const snapshot = currentSnapshot.value
  if (board && snapshot) commit(toggleSquad(board, snapshot.id, squadId))
}

function setAll(vehicleId: string, dismounted: boolean): void {
  const board = boardState.board
  const snapshot = currentSnapshot.value
  if (board && snapshot) commit(setCrewDismounted(board, snapshot.id, vehicleId, dismounted))
}

/** Mounts the selected squad and carries on with its vehicle selected. */
function mountSelected(squadId: string, vehicleId: string): void {
  switchSquad(squadId)
  select({kind: 'vehicle', id: vehicleId})
}
</script>

<template>
  <Teleport :to="map.getContainer()">
    <div v-if="subject" v-show="place" ref="menu" role="group" :aria-label="subject.title"
         class="crew-menu absolute flex w-56 flex-col gap-1 rounded-(--ui-radius) border border-default bg-default p-2 shadow-lg"
         :style="place ? {left: `${place.left}px`, top: `${place.top}px`} : undefined">
      <div class="flex items-center gap-1">
        <span class="min-w-0 grow truncate text-sm font-semibold">{{ subject.title }}</span>
        <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-x" :aria-label="t('crewMenu.close')" @click="select(null)"/>
      </div>
      <template v-if="subject.kind === 'vehicle'">
        <p v-if="!subject.squads.length" class="m-0 text-[12px] text-muted">{{ t('crewMenu.noCrew') }}</p>
        <div v-for="squad in subject.squads" :key="squad.id" class="flex items-center gap-1">
          <span class="min-w-0 grow truncate text-[13px]">{{ squad.name }}</span>
          <UButton size="xs" color="neutral" variant="outline"
                   :icon="squad.dismounted ? 'i-lucide-log-in' : 'i-lucide-log-out'"
                   :label="squad.dismounted ? t('units.mount') : t('units.dismount')"
                   :aria-label="`${squad.dismounted ? t('units.mount') : t('units.dismount')}: ${squad.name}`"
                   @click="switchSquad(squad.id)"/>
        </div>
        <div v-if="subject.squads.length > 1" class="flex gap-1 pt-1">
          <UButton size="xs" color="neutral" variant="ghost" :label="t('units.dismountAll')" @click="setAll(subject.id, true)"/>
          <UButton size="xs" color="neutral" variant="ghost" :label="t('units.mountAll')" @click="setAll(subject.id, false)"/>
        </div>
      </template>
      <UButton v-else size="xs" color="neutral" variant="outline" icon="i-lucide-log-in" :label="t('units.mount')"
               @click="mountSelected(subject.id, subject.vehicleId)"/>
    </div>
  </Teleport>
</template>

<style scoped>
.crew-menu {
  z-index: 800;
}
</style>
