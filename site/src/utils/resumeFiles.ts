import * as yaml from "js-yaml";
import { isClient } from "@renovamen/utils";
import { DEFAULT_STYLES, DEFAULT_CSS_CONTENT } from ".";
import type { ResumeStyles, ResumeStorageItem } from "~/types";

const GITHUB_OWNER = "mikeseese";
const GITHUB_REPO = "resume";
const GITHUB_BRANCH = "main";

interface ResumeManifestItem {
  id: string;
  commitHash: string;
}

/**
 * Fetch the resume manifest from GitHub's tree-commit-info endpoint
 */
export const fetchResumeManifest = async (): Promise<ResumeManifestItem[]> => {
  if (!isClient) return [];

  try {
    const res = await fetch(
      `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/tree-commit-info/${GITHUB_BRANCH}/resumes`,
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) return [];

    const data = await res.json();
    return Object.entries(data)
      .filter(([filename]) => filename.endsWith(".md"))
      .map(([filename, info]) => ({
        id: filename.replace(/\.md$/, ""),
        commitHash: (info as { oid: string }).oid
      }));
  } catch {
    return [];
  }
};

/**
 * Fetch the latest commit hash for a specific resume file from GitHub
 */
export const fetchLatestCommitHash = async (fileId: string): Promise<string | null> => {
  if (!isClient) return null;

  try {
    const res = await fetch(
      `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/commits/deferred_commit_data/${GITHUB_BRANCH}?original_branch=${GITHUB_BRANCH}&path=resumes%2F${fileId}.md`,
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) return null;

    const data = await res.json();
    if (data.deferredCommits && data.deferredCommits.length > 0) {
      return data.deferredCommits[0].oid;
    }
    return null;
  } catch {
    return null;
  }
};

/**
 * Fetch and parse a resume .md file from GitHub's raw content
 */
export const fetchResumeFile = async (id: string): Promise<ResumeStorageItem | null> => {
  if (!isClient) return null;

  try {
    const res = await fetch(
      `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/refs/heads/${GITHUB_BRANCH}/resumes/${id}.md`
    );
    if (!res.ok) return null;

    const content = await res.text();
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
    markdown: body.trim() ? `---\n---\n\n${body.trim()}\n` : `---\n---\n`,
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
