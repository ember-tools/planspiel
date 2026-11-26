<script setup lang="ts">
import {useConfirm} from '@emberbox/ui'
import {computed} from 'vue'
import {drawFeature, eraseFeature, removeFeature} from '../../board/edits'
import {AREA_STYLES, LINE_STYLES, type Feature} from '../../board/model'
import {boardState, commit, currentSnapshot, select, useTool, type Tool} from '../../board/store'
import {t} from '../../i18n'
import {MARK_KINDS, markSymbol} from '../../symbols/tactical'
import TacticalSymbol from '../TacticalSymbol.vue'

/** Tools for marks, lines, areas and texts, and the editor of the selected one. */
const confirm = useConfirm()


const editable = computed(() => !boardState.readOnly)
const snapshot = computed(() => currentSnapshot.value)

const selected = computed<Feature | null>(() => {
  const selection = boardState.selection
  if (selection?.kind !== 'feature') return null
  return boardState.board?.features[selection.id] ?? null
})

const selectedText = computed({
  get: () => (selected.value && snapshot.value?.features[selected.value.id]?.text) ?? '',
  set: text => {
    const feature = selected.value
    const drawn = feature && snapshot.value?.features[feature.id]
    if (feature && drawn && snapshot.value) commit(drawFeature(snapshot.value.id, feature.id, {...drawn, text}))
  },
})

const features = computed(() => Object.values(boardState.board?.features ?? {})
    .filter(feature => snapshot.value && Object.hasOwn(snapshot.value.features, feature.id))
    .sort((left, right) => left.order - right.order))

function isActive(tool: Tool): boolean {
  return JSON.stringify(boardState.tool) === JSON.stringify(tool)
}

function toggle(tool: Tool): void {
  useTool(isActive(tool) ? {kind: 'select'} : tool)
}

function featureName(feature: Feature): string {
  switch (feature.kind) {
    case 'mark': return t(`marks.${feature.mark}`)
    case 'line': return t(`lines.${feature.style}`)
    case 'area': return t(`areas.${feature.style}`)
    case 'text': return t('draw.text')
  }
}

function eraseHere(feature: Feature): void {
  if (snapshot.value) commit(eraseFeature(snapshot.value.id, feature.id))
  select(null)
}

async function deleteEverywhere(feature: Feature): Promise<void> {
  const confirmed = await confirm(t('draw.deleteQuestion', {name: featureName(feature)}), {
    description: t('draw.deleteDescription'), confirmLabel: t('common.delete'), danger: true,
  })
  if (confirmed && boardState.board) {
    commit(removeFeature(boardState.board, feature.id))
    select(null)
  }
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <template v-if="editable">
      <section class="flex flex-col gap-2">
        <h3 class="field-label m-0">{{ t('draw.marks') }}</h3>
        <div class="grid grid-cols-3 gap-2">
          <UButton v-for="mark in MARK_KINDS" :key="mark" color="neutral"
                   :variant="isActive({kind: 'place-mark', mark}) ? 'solid' : 'outline'"
                   class="flex h-auto min-w-0 flex-col items-center gap-1 p-1.5 text-[11px] leading-tight"
                   :title="t(`marks.${mark}`)" @click="toggle({kind: 'place-mark', mark})">
            <TacticalSymbol :svg="markSymbol(mark)" :width="32"/>
            <span class="line-clamp-2 w-full break-words text-center">{{ t(`marks.${mark}`) }}</span>
          </UButton>
        </div>
      </section>

      <section class="flex flex-col gap-2">
        <h3 class="field-label m-0">{{ t('draw.lines') }}</h3>
        <div class="flex flex-wrap gap-2">
          <UButton v-for="style in LINE_STYLES" :key="style" size="sm" color="neutral" icon="i-lucide-spline"
                   :variant="isActive({kind: 'draw-line', style}) ? 'solid' : 'outline'"
                   :label="t(`lines.${style}`)" @click="toggle({kind: 'draw-line', style})"/>
        </div>
      </section>

      <section class="flex flex-col gap-2">
        <h3 class="field-label m-0">{{ t('draw.areas') }}</h3>
        <div class="flex flex-wrap gap-2">
          <UButton v-for="style in AREA_STYLES" :key="style" size="sm" color="neutral" icon="i-lucide-pentagon"
                   :variant="isActive({kind: 'draw-area', style}) ? 'solid' : 'outline'"
                   :label="t(`areas.${style}`)" @click="toggle({kind: 'draw-area', style})"/>
        </div>
      </section>

      <section class="flex flex-col gap-2">
        <UButton size="sm" color="neutral" icon="i-lucide-type" class="self-start"
                 :variant="isActive({kind: 'place-text'}) ? 'solid' : 'outline'"
                 :label="t('draw.addText')" @click="toggle({kind: 'place-text'})"/>
        <p v-if="boardState.tool.kind !== 'select'" class="m-0 text-[13px] text-muted">
          {{ boardState.tool.kind.startsWith('draw') ? t('draw.drawHint') : t('draw.placeHint') }}
        </p>
      </section>
    </template>

    <section v-if="selected" class="flex flex-col gap-2 rounded-(--ui-radius) border border-(--eb-focus) p-3">
      <h3 class="section-title m-0">{{ featureName(selected) }}</h3>
      <UFormField :label="selected.kind === 'text' ? t('draw.text') : t('draw.label')">
        <UTextarea v-if="selected.kind === 'text'" v-model.lazy="selectedText" :rows="3" class="w-full" :disabled="!editable"/>
        <UInput v-else v-model.lazy="selectedText" class="w-full" :disabled="!editable"/>
      </UFormField>
      <p v-if="editable && (selected.kind === 'line' || selected.kind === 'area')" class="m-0 text-[13px] text-muted">
        {{ t('draw.editHint') }}
      </p>
      <div v-if="editable" class="flex flex-wrap gap-2">
        <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-eraser" :label="t('draw.eraseHere')"
                 @click="eraseHere(selected)"/>
        <UButton size="sm" color="error" variant="outline" icon="i-lucide-trash-2" :label="t('draw.deleteEverywhere')"
                 @click="deleteEverywhere(selected)"/>
      </div>
    </section>

    <section class="flex flex-col gap-2">
      <h3 class="field-label m-0">{{ t('draw.inSnapshot', {count: features.length}) }}</h3>
      <p v-if="!features.length" class="m-0 text-sm text-muted">{{ t('draw.empty') }}</p>
      <button v-for="feature in features" :key="feature.id" type="button"
              class="cursor-pointer rounded-sm px-2 py-1 text-left text-sm hover:bg-elevated"
              :class="selected?.id === feature.id ? 'bg-elevated font-semibold' : ''"
              @click="select({kind: 'feature', id: feature.id})">
        {{ featureName(feature) }}
        <span v-if="snapshot?.features[feature.id]?.text" class="text-muted"> · {{ snapshot.features[feature.id]!.text }}</span>
      </button>
    </section>
  </div>
</template>
