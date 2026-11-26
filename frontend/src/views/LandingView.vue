<script setup lang="ts">
import {usePage, webApplicationData} from '@emberbox/ui'
import {t} from '../i18n'

const DESCRIPTION = 'Eine digitale Planspielplatte für die Feuerwehr: Fahrzeuge und Trupps als taktische Zeichen auf der Karte, '
    + 'die Lage als Folge von Lageständen nach Uhrzeit und gemeinsam live im Browser. Kostenlos und ohne Anmeldung.'

usePage({
  title: 'Planspielplatte – Lagekarte für Feuerwehr-Planspiele',
  description: DESCRIPTION,
  path: '/',
  structuredData: [webApplicationData({name: 'Planspielplatte', description: DESCRIPTION})],
})

const FEATURES = [
  {
    icon: 'i-lucide-truck',
    title: 'Fahrzeuge und Trupps',
    text: 'Fahrzeuge mit ihrer Besatzung anlegen, auf die Karte ziehen und Trupps absitzen lassen. Abgesessene Trupps bewegen sich unabhängig vom Fahrzeug.',
  },
  {
    icon: 'i-lucide-map',
    title: 'Taktische Zeichen',
    text: 'Fahrzeuge, Trupps, Einsatzstellen, Schlauchleitungen, Absperrungen und Bereiche als taktische Zeichen auf einer OpenStreetMap-Karte.',
  },
  {
    icon: 'i-lucide-building-2',
    title: 'Bestand und Bezeichnungen',
    text: 'Den Fahrzeugbestand der Berliner Feuerwehr per Funkrufname wählen, und die Fahrzeugnamen und Kennzahlen der Bundesländer, wo es sie gibt.',
  },
  {
    icon: 'i-lucide-clock',
    title: 'Lagestände nach Uhrzeit',
    text: 'Die Lage zu jedem Zeitpunkt festhalten, mit Lagemeldung. Beim Durchschalten fahren die Einheiten von Stand zu Stand.',
  },
  {
    icon: 'i-lucide-users',
    title: 'Gemeinsam und live',
    text: 'Eine Platte mit einem Link gemeinsam bearbeiten und mit einem zweiten Link zeigen, etwa am Beamer, der der Spielleitung folgt.',
  },
  {
    icon: 'i-lucide-file-json',
    title: 'Im Browser oder als Datei',
    text: 'Eine Platte bleibt im Browser, bis du sie teilst, und lässt sich jederzeit als Datei speichern und wieder öffnen.',
  },
]
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

    <section aria-labelledby="features" class="flex flex-col gap-4">
      <h2 id="features" class="eyebrow m-0">Was die Planspielplatte kann</h2>
      <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <UCard v-for="feature in FEATURES" :key="feature.title">
          <div class="flex flex-col gap-2">
            <UIcon :name="feature.icon" class="size-6 text-signal"/>
            <h3 class="headline m-0 text-xl">{{ feature.title }}</h3>
            <p class="m-0 text-muted">{{ feature.text }}</p>
          </div>
        </UCard>
      </div>
    </section>

    <section class="flex max-w-3xl flex-col gap-2">
      <h2 class="eyebrow m-0">Für wen</h2>
      <p class="m-0">
        Für Ausbilderinnen und Ausbilder, Führungskräfte und Jugendfeuerwehren, die Planspiele vorbereiten und durchführen:
        die Lage auf der Karte statt auf der Sandkiste, Schritt für Schritt nachvollziehbar und für alle Beteiligten
        gleichzeitig sichtbar. Eine Platte liegt in deinem Browser; erst eine geteilte Platte liegt zusätzlich auf dem Server.
      </p>
    </section>
  </div>
</template>
