<script setup lang="ts">
import {computed, ref} from 'vue'
import TacticalSymbol from '../components/TacticalSymbol.vue'
import {DEFAULT_REGION, REGIONS, SQUAD_FUNCTIONS, baseType, defaultSquads, formatStrength, region, strength, type VehicleCategory} from '../catalog'
import {t} from '../i18n'
import {markSymbol, type MarkKind} from '../symbols/tactical'
import {squadSymbol, vehicleSymbol} from '../symbols/units'

const regionId = ref(DEFAULT_REGION)
const regionItems = REGIONS.map(entry => ({label: entry.name, value: entry.id}))
const types = computed(() => region(regionId.value).types)

const CATEGORIES: VehicleCategory[] = ['engine', 'aerial', 'command', 'technical', 'hazmat', 'logistics', 'swap-body', 'water', 'medical', 'other']

/** The region's types grouped by category, empty categories left out. */
const groups = computed(() => CATEGORIES
    .map(category => ({category, types: types.value.filter(type => baseType(type.base).category === category)}))
    .filter(group => group.types.length))

const MARKS: MarkKind[] = ['incident', 'fire', 'hazard', 'staging', 'command-post', 'water', 'casualty-collection']
</script>

<template>
  <div class="flex flex-col gap-8">
    <section class="flex flex-col gap-3">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <h1 class="headline m-0 text-3xl">{{ t('symbols.title') }}</h1>
        <UFormField :label="t('symbols.region')">
          <USelect v-model="regionId" :items="regionItems" class="w-56"/>
        </UFormField>
      </div>
      <p class="m-0 text-muted">{{ t('symbols.intro') }}</p>
    </section>

    <section class="flex flex-col gap-3">
      <h2 class="section-title m-0">{{ t('symbols.types', {count: types.length}) }}</h2>
      <template v-for="group in groups" :key="group.category">
        <h3 class="eyebrow m-0 mt-2">{{ t(`categories.${group.category}`) }}</h3>
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <div v-for="type in group.types" :key="type.id"
               class="flex items-center gap-3 rounded-(--ui-radius) border border-default p-2">
            <TacticalSymbol :svg="vehicleSymbol(type.id, regionId)" :width="64"/>
            <div class="min-w-0">
              <p class="m-0 font-semibold">
                {{ type.name }}<span v-if="type.radioCode" class="tabular text-muted"> · {{ type.radioCode }}</span>
              </p>
              <p class="m-0 truncate text-[13px] text-muted" :title="type.longName">{{ type.longName }}</p>
              <p class="m-0 text-[12px] text-muted">
                {{ baseType(type.base).name }} · {{ t('symbols.crew', {strength: formatStrength(strength(defaultSquads(type.id)))}) }}
              </p>
            </div>
          </div>
        </div>
      </template>
    </section>

    <section class="flex flex-col gap-3">
      <h2 class="section-title m-0">{{ t('symbols.squads') }}</h2>
      <div class="flex flex-wrap gap-4">
        <div v-for="entry in SQUAD_FUNCTIONS" :key="entry.id" class="flex w-24 flex-col items-center gap-1 text-center">
          <TacticalSymbol :svg="squadSymbol(entry.id)" :width="64"/>
          <span class="text-[13px]">{{ entry.name }}</span>
        </div>
      </div>
    </section>

    <section class="flex flex-col gap-3">
      <h2 class="section-title m-0">{{ t('symbols.marks') }}</h2>
      <div class="flex flex-wrap gap-4">
        <div v-for="mark in MARKS" :key="mark" class="flex w-28 flex-col items-center gap-1 text-center">
          <TacticalSymbol :svg="markSymbol(mark)" :width="64"/>
          <span class="text-[13px]">{{ t(`marks.${mark}`) }}</span>
        </div>
      </div>
    </section>
  </div>
</template>
