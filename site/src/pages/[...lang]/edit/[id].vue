<template>
  <div v-if="notFound" class="flex flex-col items-center justify-center h-full pt-32">
    <h1 text-4xl font-bold mb-4>404</h1>
    <p text-lg text-gray-500>
      {{ $t("notification.not_found", { msg: route.params.id }) }}
    </p>
  </div>

  <div v-else-if="conflict" class="edit-page flex flex-col">
    <Header>
      <template #middle>
        <span font-semibold>{{ $t("conflict.title") }}</span>
      </template>
    </Header>
    <ConflictResolver
      :resume-id="route.params.id as string"
      :local-resume="conflict.local"
      :remote-resume="conflict.remote"
      @resolved="onConflictResolved"
    />
  </div>

  <div v-else class="edit-page flex flex-col">
    <Header>
      <template #middle>
        <RenameResume />
      </template>

      <template #tail>
        <SaveResume />
        <CommitResume />
        <ToggleToolbar
          :is-toolbar-open="isToolbarOpen"
          @toggle-toolbar="isToolbarOpen = !isToolbarOpen"
        />
      </template>
    </Header>

    <div class="workspace size-full overflow-hidden" flex="~ 1" pb-2>
      <div v-bind="api.rootProps" px-3>
        <div class="editor-pane" v-bind="api.getPanelProps({ id: 'editor' })">
          <Editor />
        </div>

        <div v-bind="api.getResizeTriggerProps({ id: 'editor:preview' })" />

        <div class="preview-pane" v-bind="api.getPanelProps({ id: 'preview' })">
          <Preview />
        </div>
      </div>

      <div v-if="isToolbarOpen" class="tools-pane">
        <Toolbar />
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import * as splitter from "@zag-js/splitter";
import { normalizeProps, useMachine } from "@zag-js/vue";
import type { ResumeStorageItem } from "~/types";

// Horizontal splitpane
const [state, send] = useMachine(
  splitter.machine({
    id: "h",
    size: [{ id: "editor" }, { id: "preview" }]
  })
);

const api = computed(() => splitter.connect(state.value, send, normalizeProps));

// State
const route = useRoute();
const notFound = ref(false);
const conflict = ref<{ local: ResumeStorageItem; remote: ResumeStorageItem } | null>(
  null
);

// Fetch resume data
(async () => {
  const result = await switchResume(route.params.id as string);
  if (result.status === "not_found") {
    notFound.value = true;
  } else if (result.status === "conflict") {
    conflict.value = { local: result.local, remote: result.remote };
  }
})();

const onConflictResolved = () => {
  conflict.value = null;
};

// Toogle toolbar
const { width } = useWindowSize();
const isToolbarOpen = ref(width.value > 1024);
</script>

<style scoped>
[data-scope="splitter"][data-part="resize-trigger"] {
  @apply relative w-3 outline-none;
}

[data-scope="splitter"][data-part="resize-trigger"]::after {
  @apply content-[""] absolute bg-gray-400/40 w-1 h-10 rounded-full inset-0 m-auto;
}
</style>
