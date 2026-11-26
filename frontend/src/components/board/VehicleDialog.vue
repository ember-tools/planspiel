<script setup lang="ts">
import {computed, ref, shallowRef, watch} from 'vue'
import {
  SQUAD_FUNCTIONS, baseType, defaultSquads, findType, formatStrength, loadFleet, region, strength,
  type FleetVehicle, type VehicleCategory,
} from '../../catalog'
import {newId} from '../../board/document'
import {addVehicle, setSquads, updateVehicle} from '../../board/edits'
import {boardState, commit, select} from '../../board/store'
import {t} from '../../i18n'

/** Creates a vehicle, or edits one: its type, call sign, station and crew. */
const props = defineProps<{ vehicleId: string | null }>()
const open = defineModel<boolean>('open', {default: false})

interface SquadRow {
  id: string
  function: string
  strength: number
}

const type = ref('')
const callsign = ref('')
const station = ref('')
const squads = ref<SquadRow[]>([])
const fleet = shallowRef<FleetVehicle[]>([])
const fleetPick = ref<string | undefined>(undefined)

const regionId = computed(() => boardState.board?.region ?? '')
const editing = computed(() => props.vehicleId !== null)

const CATEGORY_ORDER: VehicleCategory[] = ['engine', 'aerial', 'command', 'technical', 'hazmat', 'logistics', 'swap-body', 'water', 'medical', 'other']

/** The region's types grouped by category, as the type picker lists them. */
const typeItems = computed(() => {
  const types = region(regionId.value).types
  return CATEGORY_ORDER
      .map(category => types.filter(entry => baseType(entry.base).category === category))
      .filter(group => group.length)
      .map(group => [
        {type: 'label' as const, label: t(`categories.${baseType(group[0]!.base).category}`), value: '', description: ''},
        ...group.map(entry => ({label: entry.name, value: entry.id, description: entry.longName})),
      ])
})

const fleetItems = computed(() => fleet.value.map(vehicle => ({
  label: vehicle.callsign,
  value: `${vehicle.stationNumber}|${vehicle.callsign}|${vehicle.type}`,
  description: `${findType(vehicle.type)?.name ?? ''} · ${vehicle.station} (${vehicle.stationNumber})`,
  vehicle,
})))

const functionItems = SQUAD_FUNCTIONS.map(entry => ({label: `${entry.name} (${entry.short})`, value: entry.id}))

const radioCode = computed(() => findType(type.value)?.radioCode)
const crewStrength = computed(() => formatStrength(strength(crew())))
const valid = computed(() => Boolean(type.value && callsign.value.trim()))

function useDefaultCrew(): void {
  squads.value = defaultSquads(type.value).map(squad => ({id: newId(), ...squad}))
}

/** Fills the form from the vehicle being edited, or empties it for a new one. */
function reset(): void {
  const vehicle = props.vehicleId ? boardState.board?.vehicles[props.vehicleId] : undefined
  fleetPick.value = undefined
  if (vehicle) {
    type.value = vehicle.type
    callsign.value = vehicle.callsign
    station.value = vehicle.station
    squads.value = Object.values(vehicle.squads)
        .sort((left, right) => left.order - right.order)
        .map(squad => ({id: squad.id, function: squad.function, strength: squad.strength}))
    return
  }
  type.value = ''
  callsign.value = ''
  station.value = ''
  squads.value = []
}

watch(open, async isOpen => {
  if (!isOpen) return
  reset()
  fleet.value = await loadFleet(regionId.value)
})

/** Picking a type for a new vehicle brings that type's crew. */
function pickType(value: string): void {
  type.value = value
  if (!editing.value) useDefaultCrew()
}

/** Picking a real vehicle fills type, call sign and station at once. */
function pickFleet(value: string | undefined): void {
  const picked = fleetItems.value.find(item => item.value === value)?.vehicle
  if (!picked) return
  fleetPick.value = value
  callsign.value = picked.callsign
  station.value = `${picked.station} (${picked.stationNumber})`
  pickType(picked.type)
}

function addSquad(): void {
  squads.value.push({id: newId(), function: 'squad', strength: 2})
}

function removeSquad(index: number): void {
  squads.value.splice(index, 1)
}

/** The crew as entered, a cleared strength counting as nobody. */
function crew(): SquadRow[] {
  return squads.value.map(squad => ({...squad, strength: Number.isFinite(squad.strength) ? Math.max(0, squad.strength) : 0}))
}

function save(): void {
  const board = boardState.board
  if (!board || !valid.value) return
  const fields = {type: type.value, callsign: callsign.value.trim(), station: station.value.trim()}
  if (props.vehicleId) {
    commit([...updateVehicle(props.vehicleId, fields), ...setSquads(board, props.vehicleId, crew())])
  } else {
    const {id, operations} = addVehicle(board, fields, crew())
    commit(operations)
    select({kind: 'vehicle', id})
  }
  open.value = false
}
</script>

<template>
  <UModal v-model:open="open" :title="editing ? t('vehicle.editTitle') : t('vehicle.addTitle')"
          :ui="{content: 'sm:max-w-2xl'}">
    <template #body>
      <form id="vehicle-form" class="grid gap-4" @submit.prevent="save">
        <UFormField v-if="fleet.length" :label="t('vehicle.fleet')" :help="t('vehicle.fleetHelp')">
          <USelectMenu :model-value="fleetPick" :items="fleetItems" value-key="value" class="w-full" virtualize
                       :filter-fields="['label', 'description']" :placeholder="t('vehicle.fleetPlaceholder')"
                       @update:model-value="pickFleet"/>
        </UFormField>

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField :label="t('vehicle.type')" required>
            <USelectMenu :model-value="type || undefined" :items="typeItems" value-key="value" class="w-full"
                         :filter-fields="['label', 'description']" :placeholder="t('vehicle.typePlaceholder')"
                         @update:model-value="pickType"/>
          </UFormField>
          <UFormField :label="t('vehicle.callsign')" required
                      :help="radioCode ? t('vehicle.radioCode', {code: radioCode}) : undefined">
            <UInput v-model="callsign" class="w-full"/>
          </UFormField>
          <UFormField :label="t('vehicle.station')" class="sm:col-span-2">
            <UInput v-model="station" class="w-full"/>
          </UFormField>
        </div>

        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between gap-2">
            <span class="field-label">{{ t('vehicle.crew', {strength: crewStrength}) }}</span>
            <div class="flex gap-1">
              <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-rotate-ccw" :disabled="!type"
                       :label="t('vehicle.defaultCrew')" @click="useDefaultCrew"/>
              <UButton size="xs" color="neutral" variant="outline" icon="i-lucide-plus" :label="t('vehicle.addSquad')"
                       @click="addSquad"/>
            </div>
          </div>
          <p v-if="!squads.length" class="m-0 text-sm text-muted">{{ t('vehicle.noCrew') }}</p>
          <div v-for="(squad, index) in squads" :key="squad.id" class="flex items-center gap-2">
            <USelect v-model="squad.function" :items="functionItems" class="grow"/>
            <UInputNumber v-model="squad.strength" :min="0" :max="99" class="w-28"/>
            <UButton color="neutral" variant="ghost" icon="i-lucide-x" :aria-label="t('vehicle.removeSquad')"
                     @click="removeSquad(index)"/>
          </div>
        </div>
      </form>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="outline" :label="t('common.cancel')" @click="open = false"/>
        <UButton type="submit" form="vehicle-form" :disabled="!valid" :label="t('common.save')"/>
      </div>
    </template>
  </UModal>
</template>
