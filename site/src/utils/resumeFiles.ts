import * as yaml from "js-yaml";
import { isClient } from "@renovamen/utils";
import { DEFAULT_STYLES, DEFAULT_CSS_CONTENT } from ".";
import type { ResumeStyles, ResumeStorageItem } from "~/types";

interface ResumeManifestItem {
  id: string;
  name: string;
}

/**
 * Fetch the resume manifest from the static site
 */
export const fetchResumeManifest = async (): Promise<ResumeManifestItem[]> => {
  if (!isClient) return [];

  try {
    const baseURL = useRuntimeConfig().app.baseURL || "/";
    const res = await fetch(`${baseURL}resumes/manifest.json`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
};

/**
 * Fetch and parse a resume .md file from the static site
 */
export const fetchResumeFile = async (id: string): Promise<ResumeStorageItem | null> => {
  if (!isClient) return null;

  try {
    const baseURL = useRuntimeConfig().app.baseURL || "/";
    const res = await fetch(`${baseURL}resumes/${id}.md`);
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
