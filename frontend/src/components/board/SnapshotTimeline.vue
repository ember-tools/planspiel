<script setup lang="ts">
import {computed, nextTick, useTemplateRef, watch} from 'vue'
import {sortedSnapshots} from '../../board/document'
import {copySnapshot} from '../../board/edits'
import type {Snapshot} from '../../board/model'
import {boardState, commit, currentSnapshot, setAnimate, showSnapshot, stepSnapshot, viewerSettings} from '../../board/store'
import {setFollow, syncState} from '../../board/sync'
import {t} from '../../i18n'

/** The snapshots of the board in time order: step through them, and add one as a copy of the shown one. */
const snapshots = computed(() => boardState.board ? sortedSnapshots(boardState.board) : [])
const currentId = computed(() => currentSnapshot.value?.id)
const position = computed(() => snapshots.value.findIndex(snapshot => snapshot.id === currentId.value))
const editable = computed(() => !boardState.readOnly)
const list = useTemplateRef<HTMLOListElement>('list')

watch(currentId, async () => {
  await nextTick()
  list.value?.querySelector('[aria-current]')?.scrollIntoView({inline: 'nearest', block: 'nearest'})
})

/** The time of a snapshot as a clock, with the date only where it differs from the first snapshot's. */
function label(snapshot: Snapshot): string {
  const [date = '', clock = ''] = snapshot.time.split('T')
  const firstDate = snapshots.value[0]?.time.split('T')[0]
  if (date === firstDate) return clock
  const [, month, day] = date.split('-')
  return `${day}.${month}. ${clock}`
}

function addSnapshot(): void {
  const board = boardState.board
  const current = currentSnapshot.value
  if (!board || !current) return
  const copy = copySnapshot(board, current.id)
  if (!copy) return
  commit(copy.operations)
  showSnapshot(copy.id)
}
</script>

<template>
  <div class="flex items-center gap-2 rounded-(--ui-radius) border border-default bg-default p-2">
    <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-chevron-left" :disabled="position <= 0"
             :aria-label="t('timeline.previous')" @click="stepSnapshot(-1)"/>
    <ol ref="list" class="m-0 flex min-w-0 grow list-none gap-1 overflow-x-auto p-0">
      <li v-for="snapshot in snapshots" :key="snapshot.id" class="shrink-0">
        <button type="button"
                class="flex cursor-pointer flex-col items-start rounded-sm border px-2 py-1 text-left"
                :class="snapshot.id === currentId ? 'border-(--eb-focus) bg-elevated' : 'border-transparent hover:bg-elevated'"
                :aria-current="snapshot.id === currentId ? 'step' : undefined"
                @click="showSnapshot(snapshot.id)">
          <span class="tabular text-sm font-semibold">{{ label(snapshot) }}</span>
          <span class="max-w-36 truncate text-[12px] text-muted">{{ snapshot.title || t('timeline.untitled') }}</span>
        </button>
      </li>
    </ol>
    <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-chevron-right"
             :disabled="position < 0 || position >= snapshots.length - 1"
             :aria-label="t('timeline.next')" @click="stepSnapshot(1)"/>
    <UButton v-if="editable" size="sm" icon="i-lucide-plus" :label="t('timeline.add')" :title="t('timeline.addHint')"
             @click="addSnapshot"/>
    <USwitch v-if="boardState.shared && boardState.readOnly" size="sm" :model-value="syncState.follow"
             :label="t('timeline.follow')" class="shrink-0" @update:model-value="setFollow"/>
    <USwitch size="sm" :model-value="viewerSettings.animate" :label="t('timeline.animate')" class="shrink-0"
             @update:model-value="setAnimate"/>
  </div>
</template>
