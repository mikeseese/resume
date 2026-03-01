<template>
  <button
    v-if="canCommit"
    class="round-btn"
    :title="$t('github.commit')"
    :disabled="committing"
    @click="commit"
  >
    <span v-if="committing" i-svg-spinners:ring-resize md:text-lg />
    <span v-else i-tabler:git-commit md:text-lg />
  </button>
</template>

<script lang="ts" setup>
import {
  getGitHubToken,
  getGitHubRepo,
  commitResumeFile
} from "~/utils/github";
import { serializeResumeFile } from "~/utils/resumeFiles";
import type { ResumeStorageItem } from "~/types";

const { data } = useDataStore();
const { styles } = useStyleStore();
const committing = ref(false);

const canCommit = computed(() => {
  return !!getGitHubToken() && !!getGitHubRepo() && !!data.curResumeId;
});

const commit = async () => {
  const token = getGitHubToken();
  const repo = getGitHubRepo();
  if (!token || !repo || !data.curResumeId) return;

  committing.value = true;

  const toast = useToast();

  try {
    const resume = {
      name: data.curResumeName,
      markdown: data.mdContent,
      css: data.cssContent,
      styles: toRaw(styles),
      update: new Date().getTime().toString()
    } as ResumeStorageItem;

    const content = serializeResumeFile(resume);

    // Use the resume ID as filename (strip "file:" prefix if present)
    const filename = data.curResumeId.startsWith("file:")
      ? data.curResumeId.substring(5)
      : data.curResumeId;

    const result = await commitResumeFile(
      token,
      repo.owner,
      repo.repo,
      filename,
      content,
      `Update resume: ${resume.name}`
    );

    if (result.success) {
      toast.save();
    } else {
      toast.commitError(result.error || "Unknown error");
    }
  } finally {
    committing.value = false;
  }
};
</script>
