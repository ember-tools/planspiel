<script setup lang="ts">
import {TacticalSymbol, unitSymbolTree, useConfirm} from '@emberbox/ui'
import {computed, ref} from 'vue'
import {formatStrength, squadFunction, typeInRegion} from '../../catalog'
import {crewOf, crewStrength, removeVehicle, setCrewDismounted, toggleSquad, withdrawVehicle} from '../../board/edits'
import {VEHICLE_DRAG_TYPE} from '../../board/map-tools'
import type {LatLng, Vehicle} from '../../board/model'
import {boardState, commit, currentSnapshot, select, useTool} from '../../board/store'
import {t} from '../../i18n'
import {vehicleSpec} from '../../symbols/units'
import VehicleDialog from './VehicleDialog.vue'

/** The vehicles of the board with their crews: add, edit, place, dismount and mount. */
const emit = defineEmits<{ focus: [position: LatLng] }>()

const confirm = useConfirm()
const dialogOpen = ref(false)
const editedId = ref<string | null>(null)

const board = computed(() => boardState.board)
const snapshot = computed(() => currentSnapshot.value)
const editable = computed(() => !boardState.readOnly)

const vehicles = computed(() => Object.values(board.value?.vehicles ?? {}).sort((left, right) => left.order - right.order))

function placement(vehicle: Vehicle) {
  return snapshot.value?.vehicles[vehicle.id]
}

function isDismounted(squadId: string): boolean {
  return Boolean(snapshot.value && Object.hasOwn(snapshot.value.squads, squadId))
}

function isSelected(kind: 'vehicle' | 'squad', id: string): boolean {
  return boardState.selection?.kind === kind && boardState.selection.id === id
}

function isExpanded(vehicle: Vehicle): boolean {
  return isSelected('vehicle', vehicle.id) || crewOf(vehicle).some(squad => isSelected('squad', squad.id))
}

function strengthLine(vehicle: Vehicle): string {
  if (!board.value || !snapshot.value) return ''
  const {mounted, dismounted} = crewStrength(board.value, snapshot.value.id, vehicle.id)
  if (!dismounted.total) return formatStrength(mounted)
  return t('units.split', {mounted: formatStrength(mounted), dismounted: formatStrength(dismounted)})
}

function typeName(vehicle: Vehicle): string {
  return typeInRegion(vehicle.type, board.value?.region ?? '')?.name ?? vehicle.type
}

function focusVehicle(vehicle: Vehicle): void {
  select({kind: 'vehicle', id: vehicle.id})
  const placed = placement(vehicle)
  if (placed) emit('focus', placed.position)
}

function focusSquad(squadId: string): void {
  select({kind: 'squad', id: squadId})
  const dismounted = snapshot.value?.squads[squadId]
  if (dismounted) emit('focus', dismounted.position)
}

function openDialog(vehicleId: string | null): void {
  editedId.value = vehicleId
  dialogOpen.value = true
}

function startDrag(event: DragEvent, vehicle: Vehicle): void {
  event.dataTransfer?.setData(VEHICLE_DRAG_TYPE, vehicle.id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function switchSquad(squadId: string): void {
  const current = board.value
  const shown = snapshot.value
  if (!current || !shown) return
  commit(toggleSquad(current, shown.id, squadId))
}

function setAllDismounted(vehicle: Vehicle, dismounted: boolean): void {
  const current = board.value
  const shown = snapshot.value
  if (!current || !shown) return
  commit(setCrewDismounted(current, shown.id, vehicle.id, dismounted))
}

function withdraw(vehicle: Vehicle): void {
  if (board.value && snapshot.value) commit(withdrawVehicle(board.value, snapshot.value.id, vehicle.id))
}

async function deleteVehicle(vehicle: Vehicle): Promise<void> {
  const confirmed = await confirm(t('units.deleteQuestion', {callsign: vehicle.callsign}), {
    description: t('units.deleteDescription'), confirmLabel: t('common.delete'), danger: true,
  })
  if (confirmed && board.value) commit(removeVehicle(board.value, vehicle.id))
}

function actions(vehicle: Vehicle) {
  return [[
    placement(vehicle)
      ? {label: t('units.withdraw'), icon: 'i-lucide-log-out', onSelect: () => withdraw(vehicle)}
      : {label: t('units.place'), icon: 'i-lucide-map-pin', onSelect: () => useTool({kind: 'place-vehicle', vehicleId: vehicle.id})},
    {label: t('common.edit'), icon: 'i-lucide-pencil', onSelect: () => openDialog(vehicle.id)},
  ], [
    {label: t('common.delete'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => deleteVehicle(vehicle)},
  ]]
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex items-center justify-between gap-2">
      <p class="m-0 text-sm text-muted">{{ t('units.count', {count: vehicles.length}) }}</p>
      <UButton v-if="editable" size="sm" icon="i-lucide-plus" :label="t('units.add')" @click="openDialog(null)"/>
    </div>

    <p v-if="!vehicles.length" class="m-0 text-sm text-muted">{{ t('units.empty') }}</p>
    <p v-else-if="editable" class="m-0 text-[13px] text-muted">{{ t('units.hint') }}</p>

    <ul class="m-0 flex list-none flex-col gap-2 p-0">
      <li v-for="vehicle in vehicles" :key="vehicle.id"
          class="rounded-(--ui-radius) border bg-default"
          :class="isExpanded(vehicle) ? 'border-(--eb-focus)' : 'border-default'">
        <div class="flex items-center gap-2 p-2" :draggable="editable" @dragstart="startDrag($event, vehicle)">
          <button type="button" class="flex min-w-0 grow cursor-pointer items-center gap-2 text-left"
                  @click="focusVehicle(vehicle)">
            <TacticalSymbol :symbol="unitSymbolTree(vehicleSpec(vehicle.type, board?.region ?? ''))" :width="44"
                            :class="placement(vehicle) ? '' : 'opacity-50'"/>
            <span class="min-w-0">
              <span class="block truncate font-semibold">{{ vehicle.callsign }}</span>
              <span class="block truncate text-[13px] text-muted">
                {{ typeName(vehicle) }} · <span class="tabular">{{ strengthLine(vehicle) }}</span>
              </span>
              <span v-if="!placement(vehicle)" class="block text-[12px] text-muted">{{ t('units.notOnScene') }}</span>
            </span>
          </button>
          <UDropdownMenu v-if="editable" :items="actions(vehicle)">
            <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-ellipsis-vertical"
                     :aria-label="t('units.actions')"/>
          </UDropdownMenu>
        </div>

        <div v-if="isExpanded(vehicle) && crewOf(vehicle).length" class="flex flex-col gap-1 border-t border-default p-2">
          <div v-for="squad in crewOf(vehicle)" :key="squad.id"
               class="flex items-center gap-2 rounded-sm px-1 py-0.5"
               :class="isSelected('squad', squad.id) ? 'bg-elevated' : ''">
            <button type="button" class="grow cursor-pointer text-left text-sm" @click="focusSquad(squad.id)">
              {{ squadFunction(squad.function).name }} <span class="tabular text-muted">({{ squad.strength }})</span>
              <span v-if="isDismounted(squad.id)" class="text-[12px] text-(--eb-signal-text)"> · {{ t('units.dismounted') }}</span>
            </button>
            <UButton v-if="editable" size="xs" color="neutral" variant="outline" :disabled="!placement(vehicle)"
                     :icon="isDismounted(squad.id) ? 'i-lucide-log-in' : 'i-lucide-log-out'"
                     :label="isDismounted(squad.id) ? t('units.mount') : t('units.dismount')"
                     @click="switchSquad(squad.id)"/>
          </div>
          <div v-if="editable && placement(vehicle)" class="mt-1 flex gap-2">
            <UButton size="xs" color="neutral" variant="ghost" :label="t('units.dismountAll')"
                     @click="setAllDismounted(vehicle, true)"/>
            <UButton size="xs" color="neutral" variant="ghost" :label="t('units.mountAll')"
                     @click="setAllDismounted(vehicle, false)"/>
          </div>
        </div>
      </li>
    </ul>

    <VehicleDialog v-model:open="dialogOpen" :vehicle-id="editedId"/>
  </div>
</template>
