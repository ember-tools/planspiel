<script setup lang="ts">
import {computed, nextTick, useTemplateRef, watch} from 'vue'
import {sortedSnapshots} from '../../board/document'
import {canInsertBetween, copySnapshot, insertSnapshotBefore, insertSnapshotBetween} from '../../board/edits'
import type {Snapshot} from '../../board/model'
import type {Operation} from '../../board/operations'
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
  if (board && current) insert(copySnapshot(board, current.id))
}

/** Inserts a snapshot before the one at `index`: between it and its predecessor, or before the first. */
function insertAt(index: number): void {
  const board = boardState.board
  const later = snapshots.value[index]
  const earlier = snapshots.value[index - 1]
  if (!board || !later) return
  insert(earlier ? insertSnapshotBetween(board, earlier.id, later.id) : insertSnapshotBefore(board, later.id))
}

function insert(created: {id: string, operations: Operation[]} | null): void {
  if (!created) return
  commit(created.operations)
  showSnapshot(created.id)
}

/** Whether a snapshot can be inserted before the one at `index`; not between two of the same time. */
function canInsertAt(index: number): boolean {
  const earlier = snapshots.value[index - 1]
  return !earlier || canInsertBetween(earlier, snapshots.value[index]!)
}

/** The label of the button that inserts a snapshot before the one at `index`. */
function insertLabel(index: number): string {
  const later = snapshots.value[index]!
  const earlier = snapshots.value[index - 1]
  return earlier
    ? t('timeline.insertBetween', {earlier: label(earlier), later: label(later)})
    : t('timeline.insertBefore', {time: label(later)})
}
</script>

<template>
  <div class="flex items-center gap-2 rounded-(--ui-radius) border border-default bg-default p-2">
    <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-chevron-left" :disabled="position <= 0"
             :aria-label="t('timeline.previous')" @click="stepSnapshot(-1)"/>
    <ol ref="list" class="m-0 flex min-w-0 grow list-none gap-1 overflow-x-auto p-0">
      <li v-for="(snapshot, index) in snapshots" :key="snapshot.id" class="flex shrink-0 items-center gap-1">
        <UButton v-if="editable && canInsertAt(index)" size="xs" color="neutral" variant="ghost" icon="i-lucide-plus" class="opacity-80 hover:opacity-100 focus-visible:opacity-100"
                 :aria-label="insertLabel(index)" :title="insertLabel(index)" @click="insertAt(index)"/>
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
