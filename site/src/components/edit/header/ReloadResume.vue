<template>
  <button
    v-if="isFileBased"
    class="round-btn"
    :title="$t('github.reload')"
    :disabled="reloading"
    @click="reload"
  >
    <span v-if="reloading" i-svg-spinners:ring-resize md:text-lg />
    <span v-else i-tabler:refresh md:text-lg />
  </button>
</template>

<script lang="ts" setup>
const { data } = useDataStore();
const reloading = ref(false);

const isFileBased = computed(() => {
  return !!data.curResumeId?.startsWith("file:");
});

const reload = async () => {
  if (!data.curResumeId) return;

  reloading.value = true;
  try {
    await forceReloadResume(data.curResumeId);
  } finally {
    reloading.value = false;
  }
};
</script>
