<script setup lang="ts">
import {useConfirm} from '@emberbox/ui'
import {computed, ref, useTemplateRef} from 'vue'
import {REGIONS} from '../../catalog'
import {createBoard} from '../../board/document'
import {BoardFormatError, parseBoard} from '../../board/validate'
import {setBoardField} from '../../board/edits'
import {boardState, commit, replaceLocalBoard} from '../../board/store'
import {t} from '../../i18n'

/** The board itself: title, region, start view, export, import and starting over. */
const emit = defineEmits<{ saveView: [] }>()

const confirm = useConfirm()
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
const importError = ref('')

const editable = computed(() => !boardState.readOnly)
const regionItems = REGIONS.map(entry => ({label: entry.name, value: entry.id}))

const title = computed({
  get: () => boardState.board?.title ?? '',
  set: value => commit(setBoardField('title', value)),
})

const regionId = computed({
  get: () => boardState.board?.region ?? '',
  set: value => commit(setBoardField('region', value)),
})

function fileName(): string {
  const base = (boardState.board?.title || t('app.name')).replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-|-$/g, '')
  return `${base || 'planspielplatte'}.json`
}

function exportBoard(): void {
  if (!boardState.board) return
  const blob = new Blob([JSON.stringify(boardState.board, null, 2)], {type: 'application/json'})
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = fileName()
  link.click()
  URL.revokeObjectURL(link.href)
}

async function importBoard(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  importError.value = ''
  if (!file) return
  try {
    const board = parseBoard(JSON.parse(await file.text()))
    const confirmed = await confirm(t('board.importQuestion'), {
      description: t('board.replaceDescription'), confirmLabel: t('board.import'), danger: true,
    })
    if (confirmed) replaceLocalBoard(board)
  } catch (error) {
    importError.value = error instanceof BoardFormatError
        ? t(`board.formatErrors.${error.problem}`, {where: error.where})
        : t('board.importInvalid')
  }
}

async function startOver(): Promise<void> {
  const confirmed = await confirm(t('board.newQuestion'), {
    description: t('board.replaceDescription'), confirmLabel: t('board.new'), danger: true,
  })
  if (confirmed) replaceLocalBoard(createBoard())
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <UFormField :label="t('board.title')">
      <UInput v-model.lazy="title" class="w-full" :disabled="!editable" :placeholder="t('board.titlePlaceholder')"/>
    </UFormField>

    <UFormField :label="t('board.region')" :help="t('board.regionHelp')">
      <USelect v-model="regionId" :items="regionItems" class="w-full" :disabled="!editable"/>
    </UFormField>

    <UButton v-if="editable" color="neutral" variant="outline" icon="i-lucide-scan" class="self-start"
             :label="t('board.saveView')" @click="emit('saveView')"/>

    <div class="flex flex-col gap-2 border-t border-default pt-4">
      <h3 class="field-label m-0">{{ t('board.file') }}</h3>
      <div class="flex flex-wrap gap-2">
        <UButton color="neutral" variant="outline" icon="i-lucide-download" :label="t('board.export')" @click="exportBoard"/>
        <template v-if="editable">
          <UButton color="neutral" variant="outline" icon="i-lucide-upload" :label="t('board.import')"
                   @click="fileInput?.click()"/>
          <input ref="fileInput" type="file" accept="application/json,.json" hidden @change="importBoard"/>
        </template>
      </div>
      <p v-if="importError" class="m-0 text-sm text-(--eb-signal-text)">{{ importError }}</p>
    </div>

    <div v-if="editable" class="flex flex-col gap-2 border-t border-default pt-4">
      <UButton color="error" variant="outline" icon="i-lucide-file-plus" class="self-start" :label="t('board.new')"
               @click="startOver"/>
    </div>
  </div>
</template>
