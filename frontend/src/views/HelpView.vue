<script setup lang="ts">
import {HelpPage, HelpSection, HelpTopic, usePage} from '@emberbox/ui'

usePage({
  title: 'Hilfe – Planspielplatte',
  description: 'So legst du in der Planspielplatte Fahrzeuge und Trupps an, hältst die Lage in Snapshots fest und teilst eine Platte.',
  path: '/hilfe',
})
</script>

<template>
  <HelpPage title="Hilfe zur Planspielplatte" back="/">
    <HelpSection title="Überblick">
      <HelpTopic :paragraphs="[
        'Die Planspielplatte ist eine Lagekarte für Planspiele der Feuerwehr: Fahrzeuge, Trupps, Einsatzstellen, Leitungen und Bereiche liegen als taktische Zeichen auf einer OpenStreetMap-Karte.',
      ]"/>
    </HelpSection>
  </HelpPage>
</template>
