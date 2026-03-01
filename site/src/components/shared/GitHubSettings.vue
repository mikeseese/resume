<template>
  <div class="github-settings">
    <div v-if="!isAuthenticated" class="space-y-3">
      <p text-sm text-light-c>
        {{ $t("github.desc") }}
      </p>
      <div class="hstack space-x-2">
        <input
          v-model="tokenInput"
          type="password"
          :placeholder="$t('github.token_placeholder')"
          class="flex-1 px-3 py-1.5 text-sm border border-c rounded bg-c text-c"
          @keyup.enter="login"
        />
        <button class="rect-btn border border-c hover:bg-darker-c" @click="login">
          <span i-tabler:brand-github text-lg />
          <span>{{ $t("github.login") }}</span>
        </button>
      </div>
      <div class="hstack space-x-2">
        <input
          v-model="repoInput"
          type="text"
          :placeholder="$t('github.repo_placeholder')"
          class="flex-1 px-3 py-1.5 text-sm border border-c rounded bg-c text-c"
        />
      </div>
      <p v-if="error" text-sm text-red-500>{{ error }}</p>
    </div>

    <div v-else class="space-y-2">
      <div class="hstack justify-between">
        <span text-sm text-c>
          <span i-tabler:brand-github mr-1 />
          {{ username }} · {{ repoDisplay }}
        </span>
        <button
          class="text-sm text-light-c hover:text-c"
          @click="logout"
        >
          {{ $t("github.logout") }}
        </button>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import {
  getGitHubToken,
  setGitHubToken,
  clearGitHubToken,
  getGitHubRepo,
  setGitHubRepo,
  validateGitHubToken,
  checkRepoAccess
} from "~/utils/github";

const { t } = useI18n();
const tokenInput = ref("");
const repoInput = ref("");
const username = ref("");
const error = ref("");
const isAuthenticated = ref(false);
const repoDisplay = ref("");

onMounted(async () => {
  const token = getGitHubToken();
  const repo = getGitHubRepo();

  if (token && repo) {
    const result = await validateGitHubToken(token);
    if (result.valid) {
      isAuthenticated.value = true;
      username.value = result.username || "";
      repoDisplay.value = `${repo.owner}/${repo.repo}`;
    }
  }

  if (repo) {
    repoInput.value = `${repo.owner}/${repo.repo}`;
  }
});

const login = async () => {
  error.value = "";

  if (!tokenInput.value.trim()) {
    error.value = t("github.error_no_token");
    return;
  }

  const repoParts = repoInput.value.trim().split("/");
  if (repoParts.length !== 2 || !repoParts[0] || !repoParts[1]) {
    error.value = t("github.error_invalid_repo");
    return;
  }

  const [owner, repo] = repoParts;

  // Validate token
  const result = await validateGitHubToken(tokenInput.value.trim());
  if (!result.valid) {
    error.value = t("github.error_invalid_token");
    return;
  }

  // Check repo access
  const hasAccess = await checkRepoAccess(tokenInput.value.trim(), owner, repo);
  if (!hasAccess) {
    error.value = t("github.error_no_access", { repo: `${owner}/${repo}` });
    return;
  }

  setGitHubToken(tokenInput.value.trim());
  setGitHubRepo({ owner, repo });
  isAuthenticated.value = true;
  username.value = result.username || "";
  repoDisplay.value = `${owner}/${repo}`;
  tokenInput.value = "";
};

const logout = () => {
  clearGitHubToken();
  isAuthenticated.value = false;
  username.value = "";
  repoDisplay.value = "";
};
</script>
