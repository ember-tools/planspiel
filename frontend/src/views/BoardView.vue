<script setup lang="ts">
import BoardMap from '../components/BoardMap.vue'
</script>

<template>
  <!-- TODO: sidebar, timeline and the board document -->
  <div class="h-[calc(100dvh-12rem)] min-h-96 overflow-hidden rounded-(--ui-radius) border border-default">
    <BoardMap/>
  </div>
</template>
