<script setup lang="ts">
import {t} from '../i18n'
</script>

<template>
  <div class="py-12 text-center">
    <h1 class="headline text-2xl">{{ t('notFound.title') }}</h1>
    <UButton color="neutral" variant="outline" class="mt-4 inline-flex" to="/" :label="t('notFound.back')"/>
  </div>
</template>
