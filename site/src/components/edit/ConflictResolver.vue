<template>
  <div class="conflict-resolver flex flex-col flex-1 overflow-hidden">
    <div
      class="p-4 bg-yellow-50 dark:bg-yellow-900/30 border-b border-yellow-200 dark:border-yellow-800"
    >
      <p text-sm text-yellow-800 dark:text-yellow-200>
        {{ $t("conflict.description") }}
      </p>
    </div>

    <div class="flex gap-2 p-3 border-b border-c bg-c">
      <button
        class="px-4 py-2 rounded text-sm font-medium bg-blue-500 text-white hover:bg-blue-600"
        @click="keepLocal"
      >
        {{ $t("conflict.keep_local") }}
      </button>
      <button
        class="px-4 py-2 rounded text-sm font-medium bg-green-500 text-white hover:bg-green-600"
        @click="useRemote"
      >
        {{ $t("conflict.use_remote") }}
      </button>
    </div>

    <div ref="diffEditorRef" class="flex-1" />
  </div>
</template>

<script lang="ts" setup>
import type * as Monaco from "monaco-editor";
import { isClient } from "@renovamen/utils";
import { setupMonaco } from "~/monaco";
import type { ResumeStorageItem } from "~/types";

const props = defineProps<{
  resumeId: string;
  localResume: ResumeStorageItem;
  remoteResume: ResumeStorageItem;
}>();

const emit = defineEmits<{
  resolved: [];
}>();

const diffEditorRef = ref<HTMLDivElement>();
let diffEditor: Monaco.editor.IStandaloneDiffEditor | undefined;

onMounted(async () => {
  if (!isClient || !diffEditorRef.value) return;

  const { monaco } = await setupMonaco();

  const originalModel = monaco.editor.createModel(
    props.remoteResume.markdown,
    "markdown"
  );
  const modifiedModel = monaco.editor.createModel(props.localResume.markdown, "markdown");

  diffEditor = monaco.editor.createDiffEditor(diffEditorRef.value, {
    readOnly: true,
    automaticLayout: true,
    renderSideBySide: true,
    fontSize: 13,
    fontFamily: `Menlo, Monaco, "Courier New", monospace`,
    lineHeight: 1.5
  });

  diffEditor.setModel({
    original: originalModel,
    modified: modifiedModel
  });

  // Theme
  const colorMode = useColorMode();
  monaco.editor.setTheme(colorMode.preference === "dark" ? "vs-dark-dimmed" : "vs");

  watch(
    () => colorMode.preference,
    (val) => {
      monaco.editor.setTheme(val === "dark" ? "vs-dark-dimmed" : "vs");
    }
  );
});

onBeforeUnmount(() => {
  if (diffEditor) diffEditor.dispose();
});

const keepLocal = async () => {
  await resolveConflict(
    props.resumeId,
    { ...props.localResume },
    props.remoteResume.commitHash!
  );
  emit("resolved");
};

const useRemote = async () => {
  await resolveConflict(
    props.resumeId,
    { ...props.remoteResume },
    props.remoteResume.commitHash!
  );
  emit("resolved");
};
</script>
