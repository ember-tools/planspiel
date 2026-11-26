<script setup lang="ts">
import {HelpPage, HelpSection, HelpTopic, usePage} from '@emberbox/ui'

usePage({
  title: 'Hilfe – Planspielplatte',
  description: 'So legst du in der Planspielplatte Fahrzeuge und Trupps an, hältst die Lage in Lageständen fest und bearbeitest eine Platte gemeinsam.',
  path: '/hilfe',
})
</script>

<template>
  <HelpPage title="Hilfe zur Planspielplatte" back="/">
    <HelpSection title="Überblick">
      <HelpTopic :paragraphs="[
        'Die Planspielplatte ist eine Lagekarte für Planspiele der Feuerwehr. Fahrzeuge, Trupps, Einsatzstellen, Leitungen und Bereiche liegen als taktische Zeichen auf einer OpenStreetMap-Karte.',
        'Der Verlauf einer Übung besteht aus Lageständen: Jeder hält fest, wo zu einer Uhrzeit alles steht. Zwischen den Lageständen schaltest du hin und her, die Einheiten fahren dabei von einem Stand zum nächsten.',
        'Unter „Platte“ arbeitest du an einer Platte in deinem Browser. Erst wenn du sie teilst, liegt sie auf dem Server und lässt sich gemeinsam bearbeiten.',
      ]"/>
    </HelpSection>

    <HelpSection title="Fahrzeuge und Trupps">
      <HelpTopic title="Fahrzeug anlegen" :paragraphs="[
        'Im Reiter „Einheiten“ legst du mit „Fahrzeug“ ein neues Fahrzeug an. Wähle den Typ aus der Liste, gib den Funkrufnamen ein und, wenn du willst, die Wache.',
        'In Berlin kannst du stattdessen ein echtes Fahrzeug aus dem Bestand wählen: Tippe den Funkrufnamen oder die Wache, und Typ, Funkrufname und Wache werden übernommen.',
        'Jeder Typ bringt eine Standard-Besatzung mit, etwa Gruppenführer, Maschinist, Angriffs-, Wasser- und Schlauchtrupp. Du kannst Trupps entfernen, hinzufügen und ihre Stärke ändern.',
      ]"/>
      <HelpTopic title="Platzieren" :paragraphs="[
        'Ziehe ein Fahrzeug aus der Liste auf die Karte, oder wähle im Menü des Fahrzeugs „Platzieren“ und klicke auf die Stelle. Auf der Karte verschiebst du es mit der Maus.',
        'Ein Fahrzeug, das in einem Lagestand nicht auf der Karte steht, ist in diesem Lagestand nicht vor Ort. Mit „Von der Karte nehmen“ nimmst du es wieder herunter.',
      ]"/>
      <HelpTopic title="Absitzen und aufsitzen" :paragraphs="[
        'Klicke ein Fahrzeug an, dann erscheinen seine Trupps. Mit „Absitzen“ steigt ein Trupp aus und steht neben dem Fahrzeug; von da an bewegst du ihn unabhängig. Mit „Aufsitzen“ steigt er wieder ein und fährt mit dem Fahrzeug. Absitzen kann nur, wer in einem Fahrzeug auf der Karte sitzt.',
        '„Alle absitzen“ und „Alle aufsitzen“ erledigen das für die ganze Besatzung auf einmal.',
        'Unter dem Fahrzeug steht die Stärke der Besatzung an Bord als Führer/Unterführer/Mannschaft/Gesamt, etwa 0/1/5/6.',
      ]"/>
    </HelpSection>

    <HelpSection title="Zeichnen">
      <HelpTopic :paragraphs="[
        'Im Reiter „Zeichnen“ setzt du Zeichen wie Schadensstelle, Brand, Gefahr, Einsatzleitung, Wasserentnahmestelle und Verletztensammelstelle mit einem Klick auf die Karte.',
        'Linien (Schlauchleitung, Absperrung, Weg) und Flächen (Gefahrenbereich, Einsatzabschnitt) zeichnest du Punkt für Punkt. Ein Doppelklick oder ein Klick auf den ersten Punkt beendet sie, Esc bricht ab.',
        'Einen Bereitstellungsraum ziehst du als Rechteck auf: Klicke auf zwei gegenüberliegende Ecken. Ausgewählt lässt er sich an den Ecken vergrößern und verkleinern, am Punkt darüber drehen und in der Mitte verschieben.',
        'Mit „Text setzen“ und einem Klick auf die Karte legst du einen freien Text ab, etwa einen Hinweis zur Zufahrt.',
        'Klickst du etwas Gezeichnetes an, kannst du es beschriften – die Beschriftung steht dann auf der Karte –, die Punkte von Linien und Flächen verschieben, es nur aus diesem Lagestand entfernen oder überall löschen.',
      ]"/>
    </HelpSection>

    <HelpSection title="Lagestände">
      <HelpTopic :paragraphs="[
        'Unter der Karte stehen die Lagestände nach Uhrzeit. „Lagestand“ legt einen neuen als Kopie des gezeigten an, fünf Minuten später. Danach verschiebst du dort, was sich bewegt hat.',
        'Das kleine Plus vor einem Lagestand fügt einen neuen davor ein: zwischen zwei Lageständen zur Uhrzeit in der Mitte, mit allem, was in einem der beiden zu sehen ist – was in beiden steht, an der Stelle des früheren. Vor dem ersten Lagestand entsteht eine Kopie fünf Minuten früher.',
        'Mit den Pfeiltasten links und rechts oder den Pfeilen an der Zeitleiste schaltest du durch die Lagestände. Die Animation lässt sich an der Zeitleiste ausschalten.',
        'Im Reiter „Lage“ stellst du Uhrzeit und Titel des Lagestands ein und schreibst die Lagemeldung dazu.',
      ]"/>
    </HelpSection>

    <HelpSection title="Präsentieren">
      <HelpTopic :paragraphs="[
        '„Präsentieren“ neben dem Titel zeigt die Platte im Vollbild: Kopf- und Fußzeile verschwinden, Karte, Zeitleiste und Seitenleiste füllen den Bildschirm.',
        'Die Seitenleiste blendest du mit dem Knopf oben rechts auf der Karte oder der Taste S aus und wieder ein; ohne sie hat die Karte die ganze Breite. Mit Esc oder „Beenden“ verlässt du das Vollbild.',
      ]"/>
    </HelpSection>

    <HelpSection title="Teilen und gemeinsam bearbeiten">
      <HelpTopic :paragraphs="[
        'Im Reiter „Platte“ legst du die Platte mit „Platte teilen“ auf den Server. Du bekommst zwei Links: einen zum Bearbeiten und einen zum Zusehen.',
        'Alle mit dem Link zum Bearbeiten arbeiten gleichzeitig an derselben Platte, jede Änderung erscheint sofort bei allen. Ändern zwei Leute im selben Moment dasselbe, gilt die Änderung, die zuletzt beim Server ankommt.',
        'Wer den Link zum Zusehen hat, sieht alles live, kann aber nichts ändern. Mit „Spielleitung folgen“ springt die Ansicht mit, wenn jemand mit dem Link zum Bearbeiten den Lagestand wechselt; so eignet sich der Link für den Beamer.',
        'Reißt die Verbindung ab, verbindet sich die Seite von selbst neu und reicht deine Änderungen nach, solange die Seite geöffnet bleibt. Über den Reitern siehst du, ob die Verbindung steht und wie viele gerade bearbeiten und zusehen.',
        'Nach dem Teilen beginnt die Platte in deinem Browser leer. Geteilte Platten, die du geöffnet hast, findest du unter „Zuletzt geöffnet“. Gelöscht wird eine geteilte Platte nur über den Link zum Bearbeiten.',
      ]"/>
    </HelpSection>

    <HelpSection title="Regionen und Bezeichnungen">
      <HelpTopic :paragraphs="[
        'Die Region einer Platte bestimmt, wie die Fahrzeuge heißen. Berlin nutzt den Bestand der Berliner Feuerwehr; mehrere Bundesländer haben ihre eigenen Listen samt Kennzahl im Funkrufnamen, die übrigen nutzen die Norm-Bezeichnungen.',
        'Wechselst du die Region, erscheinen Fahrzeuge unter dem passenden Namen der neuen Region. Gespeichert bleibt der ursprüngliche Typ, ein Wechsel zurück stellt alles wieder her.',
      ]"/>
    </HelpSection>

    <HelpSection title="Daten">
      <HelpTopic :paragraphs="[
        'Eine Platte, die du nicht teilst, liegt nur in deinem Browser. Mit „Als Datei speichern“ sicherst du sie, mit „Datei öffnen“ lädst du sie wieder. „Neue Platte“ fängt von vorn an.',
        'Mit „Kartenausschnitt als Start merken“ legst du fest, welchen Ausschnitt die Platte beim Öffnen zeigt.',
        'Eine geteilte Platte liegt auf dem Server, bis sie über den Link zum Bearbeiten gelöscht wird. Wer einen der Links hat, kann sie öffnen.',
        'Die Kartenkacheln kommen von OpenStreetMap über den Server der Planspielplatte, dein Browser verbindet sich nicht mit OpenStreetMap.',
        'Die Adresssuche oben links auf der Karte springt zum gewählten Ort. Gesucht wird bei Photon von Komoot, aber über den Server der Planspielplatte: Komoot sieht deine IP-Adresse nicht, und der Server speichert keine Suchbegriffe dauerhaft.',
      ]"/>
    </HelpSection>
  </HelpPage>
</template>
