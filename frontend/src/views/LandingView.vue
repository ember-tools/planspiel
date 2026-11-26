<script setup lang="ts">
import {usePage, webApplicationData} from '@emberbox/ui'
import {t} from '../i18n'

const DESCRIPTION = 'Eine digitale Planspielplatte für die Feuerwehr: Fahrzeuge und Trupps als taktische Zeichen auf der Karte, '
    + 'die Lage als Folge von Snapshots nach Uhrzeit und gemeinsam live im Browser. Kostenlos und ohne Anmeldung.'

usePage({
  title: 'Planspielplatte – Lagekarte für Feuerwehr-Planspiele',
  description: DESCRIPTION,
  path: '/',
  structuredData: [webApplicationData({name: 'Planspielplatte', description: DESCRIPTION})],
})
</script>

<template>
  <div class="mx-auto flex max-w-5xl flex-col gap-10 py-4">
    <section class="flex max-w-3xl flex-col gap-3">
      <p class="eyebrow">Planspielplatte</p>
      <h1 class="headline m-0 text-4xl md:text-5xl">Lagekarte für Feuerwehr-Planspiele</h1>
      <p class="m-0 text-lg text-muted">{{ DESCRIPTION }}</p>
      <div class="flex flex-wrap gap-2">
        <UButton to="/platte" icon="i-lucide-arrow-right" trailing :label="t('nav.openBoard')"/>
        <UButton to="/hilfe" color="neutral" variant="outline" icon="i-lucide-life-buoy" :label="t('nav.help')"/>
      </div>
    </section>
  </div>
</template>
