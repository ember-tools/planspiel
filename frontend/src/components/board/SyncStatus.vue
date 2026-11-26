<script setup lang="ts">
import {computed} from 'vue'
import {boardState} from '../../board/store'
import {syncState} from '../../board/sync'
import {t} from '../../i18n'

/** How the connection of a shared board stands and who else has it open. */
const label = computed(() => {
  switch (syncState.status) {
    case 'live':
      return t('sync.live', {editors: syncState.editors, readers: syncState.readers})
    case 'offline':
      return syncState.pending ? t('sync.offlinePending', {count: syncState.pending}) : t('sync.offline')
    default:
      return t(`sync.${syncState.status}`)
  }
})

const colour = computed(() => syncState.status === 'live' ? 'success' : syncState.status === 'connecting' ? 'neutral' : 'error')
</script>

<template>
  <div v-if="boardState.shared || syncState.status !== 'live'" class="flex flex-wrap items-center gap-2">
    <UBadge :color="colour" variant="subtle" :icon="syncState.status === 'live' ? 'i-lucide-radio' : 'i-lucide-wifi-off'"
            :label="label"/>
    <UBadge v-if="boardState.readOnly" color="neutral" variant="outline" icon="i-lucide-eye" :label="t('sync.readOnly')"/>
  </div>
</template>
