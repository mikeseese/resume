import * as localForage from "localforage";
import { isClient } from "@renovamen/utils";
import type { ResumeStorage } from "~/types";

const MARKDOWN_RESUME_KEY = "MARKDOWN_RESUME_data";

const GITHUB_TOKEN_KEY = "MARKDOWN_RESUME_github_token";
const GITHUB_REPO_KEY = "MARKDOWN_RESUME_github_repo";

export interface GitHubRepoConfig {
  owner: string;
  repo: string;
}

/**
 * Get the stored GitHub Personal Access Token
 */
export const getGitHubToken = (): string | null => {
  if (!isClient) return null;
  return localStorage.getItem(GITHUB_TOKEN_KEY);
};

/**
 * Store a GitHub Personal Access Token
 */
export const setGitHubToken = (token: string): void => {
  if (!isClient) return;
  localStorage.setItem(GITHUB_TOKEN_KEY, token);
};

/**
 * Remove the stored GitHub token
 */
export const clearGitHubToken = (): void => {
  if (!isClient) return;
  localStorage.removeItem(GITHUB_TOKEN_KEY);
};

/**
 * Get the configured GitHub repo (owner/repo)
 */
export const getGitHubRepo = (): GitHubRepoConfig | null => {
  if (!isClient) return null;
  const stored = localStorage.getItem(GITHUB_REPO_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
};

/**
 * Store the GitHub repo config
 */
export const setGitHubRepo = (config: GitHubRepoConfig): void => {
  if (!isClient) return;
  localStorage.setItem(GITHUB_REPO_KEY, JSON.stringify(config));
};

/**
 * Validate the GitHub token by checking the authenticated user
 */
export const validateGitHubToken = async (
  token: string
): Promise<{ valid: boolean; username?: string }> => {
  try {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json"
      }
    });
    if (res.ok) {
      const data = await res.json();
      return { valid: true, username: data.login };
    }
    return { valid: false };
  } catch {
    return { valid: false };
  }
};

/**
 * Check if the authenticated user has write access to the repo
 */
export const checkRepoAccess = async (
  token: string,
  owner: string,
  repo: string
): Promise<boolean> => {
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json"
      }
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.permissions?.push === true || data.permissions?.admin === true;
  } catch {
    return false;
  }
};

/**
 * Get the SHA of a file in the repo (needed for updates)
 */
const getFileSha = async (
  token: string,
  owner: string,
  repo: string,
  path: string
): Promise<string | null> => {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json"
        }
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.sha;
  } catch {
    return null;
  }
};

/**
 * Commit a resume file to the GitHub repo
 */
export const commitResumeFile = async (
  token: string,
  owner: string,
  repo: string,
  filename: string,
  content: string,
  message: string
): Promise<{ success: boolean; error?: string }> => {
  const path = `resumes/${filename}.md`;

  try {
    // Get existing file SHA if it exists (required for updates)
    const sha = await getFileSha(token, owner, repo, path);

    const body: Record<string, string> = {
      message,
      content: btoa(
        Array.from(new TextEncoder().encode(content))
          .map((b) => String.fromCharCode(b))
          .join("")
      )
    };

    if (sha) {
      body.sha = sha;
    }

    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      }
    );

    if (res.ok) {
      // Update local storage: set dirty to false and update commitHash
      const data = await res.json();
      const newBlobSha = data?.content?.sha;
      if (newBlobSha) {
        const storage: ResumeStorage =
          (await localForage.getItem<ResumeStorage>(MARKDOWN_RESUME_KEY)) || {};
        const storageKey = `file:${filename}`;
        if (storage[storageKey]) {
          storage[storageKey].commitHash = newBlobSha;
          storage[storageKey].dirty = false;
          await localForage.setItem(MARKDOWN_RESUME_KEY, storage);
        }
      }
      return { success: true };
    }

    const errorData = await res.json();
    return { success: false, error: errorData.message || "Failed to commit" };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
};

/**
 * Delete a resume file from the GitHub repo
 */
export const deleteResumeFile = async (
  token: string,
  owner: string,
  repo: string,
  filename: string,
  message: string
): Promise<{ success: boolean; error?: string }> => {
  const path = `resumes/${filename}.md`;

  try {
    const sha = await getFileSha(token, owner, repo, path);
    if (!sha) {
      return { success: false, error: "File not found in repository" };
    }

    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ message, sha })
      }
    );

    if (res.ok) {
      // Remove the resume from local storage cache
      const storage: ResumeStorage =
        (await localForage.getItem<ResumeStorage>(MARKDOWN_RESUME_KEY)) || {};
      const storageKey = `file:${filename}`;
      if (storage[storageKey]) {
        delete storage[storageKey];
        await localForage.setItem(MARKDOWN_RESUME_KEY, storage);
      }
      return { success: true };
    }

    const errorData = await res.json();
    return { success: false, error: errorData.message || "Failed to delete" };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
};
