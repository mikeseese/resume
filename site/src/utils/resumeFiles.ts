import * as yaml from "js-yaml";
import { isClient } from "@renovamen/utils";
import { DEFAULT_STYLES, DEFAULT_CSS_CONTENT } from ".";
import { getGitHubToken } from "./github";
import type { ResumeStyles, ResumeStorageItem } from "~/types";

const GITHUB_OWNER = "mikeseese";
const GITHUB_REPO = "resume";
const GITHUB_BRANCH = "main";

interface ResumeManifestItem {
  id: string;
  commitHash: string;
}

/**
 * Build GitHub API request headers, including PAT token auth if available
 */
const getGitHubApiHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json"
  };
  const token = getGitHubToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
};

/**
 * Fetch the resume manifest from GitHub REST API (Contents endpoint)
 */
export const fetchResumeManifest = async (): Promise<ResumeManifestItem[]> => {
  if (!isClient) return [];

  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/resumes?ref=${GITHUB_BRANCH}`,
      { headers: getGitHubApiHeaders() }
    );
    if (!res.ok) return [];

    const data = await res.json();
    if (!Array.isArray(data)) return [];

    return data
      .filter(
        (item: { name: string; type: string }) =>
          item.type === "file" && item.name.endsWith(".md")
      )
      .map((item: { name: string; sha: string }) => ({
        id: item.name.replace(/\.md$/, ""),
        commitHash: item.sha
      }));
  } catch {
    return [];
  }
};

/**
 * Fetch the latest blob SHA for a specific resume file from GitHub REST API
 */
export const fetchLatestCommitHash = async (fileId: string): Promise<string | null> => {
  if (!isClient) return null;

  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/resumes/${fileId}.md?ref=${GITHUB_BRANCH}`,
      { headers: getGitHubApiHeaders() }
    );
    if (!res.ok) return null;

    const data = await res.json();
    return data.sha || null;
  } catch {
    return null;
  }
};

/**
 * Fetch and parse a resume .md file from GitHub REST API (Contents endpoint)
 */
export const fetchResumeFile = async (id: string): Promise<ResumeStorageItem | null> => {
  if (!isClient) return null;

  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/resumes/${id}.md?ref=${GITHUB_BRANCH}`,
      { headers: getGitHubApiHeaders() }
    );
    if (!res.ok) return null;

    const data = await res.json();
    if (!data.content) return null;

    // Decode base64 content with proper UTF-8 handling
    const bytes = Uint8Array.from(atob(data.content.replace(/\n/g, "")), (c) =>
      c.charCodeAt(0)
    );
    const content = new TextDecoder().decode(bytes);

    return parseResumeFile(content, id);
  } catch {
    return null;
  }
};

/**
 * Parse a resume .md file into a ResumeStorageItem
 */
export const parseResumeFile = (content: string, id: string): ResumeStorageItem => {
  const { attributes, body } = extractFrontMatter(content);

  const styles: ResumeStyles = {
    marginV: attributes.styles?.marginV ?? DEFAULT_STYLES.marginV,
    marginH: attributes.styles?.marginH ?? DEFAULT_STYLES.marginH,
    lineHeight: attributes.styles?.lineHeight ?? DEFAULT_STYLES.lineHeight,
    paragraphSpace: attributes.styles?.paragraphSpace ?? DEFAULT_STYLES.paragraphSpace,
    themeColor: attributes.styles?.themeColor ?? DEFAULT_STYLES.themeColor,
    fontCJK: attributes.styles?.fontCJK ?? DEFAULT_STYLES.fontCJK,
    fontEN: attributes.styles?.fontEN ?? DEFAULT_STYLES.fontEN,
    fontSize: attributes.styles?.fontSize ?? DEFAULT_STYLES.fontSize,
    paper: attributes.styles?.paper ?? DEFAULT_STYLES.paper
  };

  return {
    name: attributes.name || id,
    markdown: body.trim() + "\n",
    css: attributes.css || DEFAULT_CSS_CONTENT,
    styles,
    update: id
  };
};

/**
 * Simple frontmatter extraction for resume files
 * (Re-uses the pattern from @renovamen/front-matter but with yaml.load for full objects)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const extractFrontMatter = (content: string): { attributes: any; body: string } => {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!match) {
    return { attributes: {}, body: content };
  }

  try {
    const attributes = yaml.load(match[1]) || {};
    return { attributes, body: match[2] };
  } catch {
    return { attributes: {}, body: match[2] };
  }
};

/**
 * Serialize a resume to .md file format with YAML frontmatter
 */
export const serializeResumeFile = (resume: ResumeStorageItem): string => {
  // Extract the body content (strip the inner ---/--- frontmatter wrapper)
  let body = resume.markdown;
  const innerFmMatch = body.match(/^---\s*\n[\s\S]*?\n---\s*\n?([\s\S]*)$/);
  if (innerFmMatch) {
    body = innerFmMatch[1];
  }

  // Build frontmatter
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const frontmatter: Record<string, any> = {
    name: resume.name,
    styles: resume.styles
  };

  // Only include CSS if it differs from the default
  if (resume.css && resume.css !== DEFAULT_CSS_CONTENT) {
    frontmatter.css = resume.css;
  }

  const yamlStr = yaml.dump(frontmatter, {
    lineWidth: -1,
    quotingType: '"',
    forceQuotes: false
  });

  return `---\n${yamlStr}---\n\n${body.trim()}\n`;
};
