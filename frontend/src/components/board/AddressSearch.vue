<script setup lang="ts">
import {MAX_SEARCH, type Place} from '../../api/geocode'
import {useAddressSearch} from '../../composables/useAddressSearch'
import {t} from '../../i18n'

/** A search field for addresses and places; picking a result hands its position to the map. */
const emit = defineEmits<{found: [place: Place]}>()

const {text, places, loading, emptyText} = useAddressSearch()

function pick(place: Place | undefined): void {
    if (place) emit('found', place)
}
</script>

<template>
  <UInputMenu v-model:search-term="text" :items="places" label-key="label" ignore-filter :loading="loading"
              icon="i-lucide-search" size="sm" class="w-72 min-w-0" :placeholder="t('search.placeholder')"
              :aria-label="t('search.label')" :maxlength="MAX_SEARCH" @update:model-value="pick">
    <template #empty>{{ emptyText }}</template>
  </UInputMenu>
</template>
