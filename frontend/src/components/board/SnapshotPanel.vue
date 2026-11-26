<script setup lang="ts">
import {useConfirm} from '@emberbox/ui'
import {computed} from 'vue'
import {removeSnapshot, updateSnapshot} from '../../board/edits'
import {boardState, commit, currentSnapshot, showSnapshot} from '../../board/store'
import {sortedSnapshots} from '../../board/document'
import {t} from '../../i18n'

/** The shown snapshot: its time, title and situation report. */
const confirm = useConfirm()
const editable = computed(() => !boardState.readOnly)
const snapshot = computed(() => currentSnapshot.value)
const canRemove = computed(() => Object.keys(boardState.board?.snapshots ?? {}).length > 1)

function field(key: 'title' | 'report') {
  return computed({
    get: () => snapshot.value?.[key] ?? '',
    set: (value: string) => {
      if (!snapshot.value) return
      commit(updateSnapshot(snapshot.value.id, {[key]: value}))
    },
  })
}

/** Takes a new time from the field, or puts the stored one back when the field holds none. */
function changeTime(event: Event): void {
  const input = event.target as HTMLInputElement
  const shown = snapshot.value
  if (!shown) return
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input.value)) commit(updateSnapshot(shown.id, {time: input.value}))
  else input.value = shown.time
}

const title = field('title')
const report = field('report')

async function remove(): Promise<void> {
  const board = boardState.board
  const shown = snapshot.value
  if (!board || !shown) return
  const confirmed = await confirm(t('snapshot.deleteQuestion'), {
    description: t('snapshot.deleteDescription'), confirmLabel: t('common.delete'), danger: true,
  })
  if (!confirmed) return
  const ordered = sortedSnapshots(board)
  const index = ordered.findIndex(entry => entry.id === shown.id)
  const neighbour = ordered[index - 1] ?? ordered[index + 1]
  commit(removeSnapshot(board, shown.id))
  if (neighbour) showSnapshot(neighbour.id)
}
</script>

<template>
  <div v-if="snapshot" class="flex flex-col gap-4">
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
      <UFormField :label="t('snapshot.time')" :help="t('snapshot.timeHelp')">
        <UInput :model-value="snapshot.time" type="datetime-local" class="w-full" :disabled="!editable" @change="changeTime"/>
      </UFormField>
      <UFormField :label="t('snapshot.title')">
        <UInput v-model.lazy="title" class="w-full" :disabled="!editable" :placeholder="t('snapshot.titlePlaceholder')"/>
      </UFormField>
    </div>
    <UFormField :label="t('snapshot.report')">
      <UTextarea v-model.lazy="report" :rows="8" autoresize class="w-full" :disabled="!editable"
                 :placeholder="t('snapshot.reportPlaceholder')"/>
    </UFormField>
    <UButton v-if="editable" color="error" variant="outline" icon="i-lucide-trash-2" class="self-start"
             :disabled="!canRemove" :label="t('snapshot.delete')" @click="remove"/>
  </div>
</template>
