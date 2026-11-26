<script setup lang="ts">
import {copyToClipboard, useConfirm} from '@emberbox/ui'
import {computed, ref} from 'vue'
import {useRouter} from 'vue-router'
import {BoardRequestError, boardLink, deleteSharedBoard, shareBoard} from '../../api/boards'
import {createBoard} from '../../board/document'
import {forgetBoard, recentBoards, type RecentBoard} from '../../board/recent'
import {boardState, replaceLocalBoard} from '../../board/store'
import {syncState} from '../../board/sync'
import {t} from '../../i18n'

/** Sharing: turn the local board into a shared one, show its links, or delete it again. */
const confirm = useConfirm()
const router = useRouter()
const busy = ref(false)
const error = ref('')
const copied = ref('')
const recent = ref<RecentBoard[]>(recentBoards())

const editLink = computed(() => boardState.shared && !boardState.readOnly ? boardLink(syncState.token) : '')
const readLink = computed(() => {
  if (!boardState.shared) return ''
  return boardLink(boardState.readOnly ? syncState.token : syncState.readToken)
})

async function share(): Promise<void> {
  const board = boardState.board
  if (!board) return
  const confirmed = await confirm(t('share.question'), {description: t('share.description'), confirmLabel: t('share.action')})
  if (!confirmed) return
  busy.value = true
  error.value = ''
  try {
    const tokens = await shareBoard(board)
    replaceLocalBoard(createBoard())
    await router.push(`/p/${tokens.editToken}`)
  } catch (failure) {
    error.value = failure instanceof BoardRequestError && failure.status === 429 ? t('share.tooMany') : t('share.failed')
  } finally {
    busy.value = false
  }
}

async function copy(link: string): Promise<void> {
  if (await copyToClipboard(link)) copied.value = link
}

async function remove(): Promise<void> {
  const confirmed = await confirm(t('share.deleteQuestion'), {
    description: t('share.deleteDescription'), confirmLabel: t('common.delete'), danger: true,
  })
  if (!confirmed) return
  try {
    await deleteSharedBoard(syncState.token)
    forgetBoard(syncState.token)
    await router.push('/platte')
  } catch {
    error.value = t('share.deleteFailed')
  }
}

function forget(token: string): void {
  forgetBoard(token)
  recent.value = recentBoards()
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <h3 class="field-label m-0">{{ t('share.title') }}</h3>

    <template v-if="!boardState.shared">
      <p class="m-0 text-sm text-muted">{{ t('share.intro') }}</p>
      <UButton icon="i-lucide-share-2" class="self-start" :loading="busy" :label="t('share.action')" @click="share"/>
    </template>

    <template v-else>
      <UFormField v-if="editLink" :label="t('share.editLink')" :help="t('share.editLinkHelp')">
        <UFieldGroup class="w-full">
          <UInput :model-value="editLink" readonly class="w-full" @focus="($event.target as HTMLInputElement).select()"/>
          <UButton color="neutral" variant="outline" icon="i-lucide-copy" :aria-label="t('share.copy')" @click="copy(editLink)"/>
        </UFieldGroup>
      </UFormField>
      <UFormField v-if="readLink" :label="t('share.readLink')" :help="t('share.readLinkHelp')">
        <UFieldGroup class="w-full">
          <UInput :model-value="readLink" readonly class="w-full" @focus="($event.target as HTMLInputElement).select()"/>
          <UButton color="neutral" variant="outline" icon="i-lucide-copy" :aria-label="t('share.copy')" @click="copy(readLink)"/>
        </UFieldGroup>
      </UFormField>
      <p v-if="copied" class="m-0 text-[13px] text-muted">{{ t('share.copied') }}</p>
      <UButton v-if="!boardState.readOnly" color="error" variant="outline" icon="i-lucide-trash-2" class="self-start"
               :label="t('share.delete')" @click="remove"/>
    </template>

    <p v-if="error" class="m-0 text-sm text-(--eb-signal-text)">{{ error }}</p>

    <div v-if="!boardState.shared && recent.length" class="flex flex-col gap-1 border-t border-default pt-3">
      <h3 class="field-label m-0">{{ t('share.recent') }}</h3>
      <div v-for="entry in recent" :key="entry.token" class="flex items-center gap-2">
        <RouterLink :to="`/p/${entry.token}`" class="grow truncate text-sm hover:underline">
          {{ entry.title || t('board.untitled') }}
          <span class="text-muted">· {{ entry.editable ? t('share.editable') : t('share.readable') }}</span>
        </RouterLink>
        <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-x" :aria-label="t('share.forget')"
                 @click="forget(entry.token)"/>
      </div>
    </div>
  </div>
</template>
