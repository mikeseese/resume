#!/usr/bin/env node

/**
 * Generate a PDF of the most recently edited resume.
 *
 * This script:
 * 1. Finds the most recently modified resume file in resumes/
 * 2. Parses the YAML frontmatter for styles and the markdown body
 * 3. Renders the markdown to HTML using the same pipeline as the app
 * 4. Generates a self-contained HTML document with the resume's built-in styling
 * 5. Uses Puppeteer to render it and export to PDF
 * 6. Saves to site/dist/latest.pdf
 */

import { execSync } from "node:child_process";
import { readFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import MarkdownIt from "markdown-it";
import MarkdownItDeflist from "markdown-it-deflist";
import LinkAttributes from "markdown-it-link-attributes";
import MarkdownItKatex from "@renovamen/markdown-it-katex";
import MarkdownItCite from "markdown-it-cross-ref";
import MarkdownItLatexCmds from "markdown-it-latex-cmds";
import puppeteer from "puppeteer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SITE_DIR = resolve(__dirname, "..");
const ROOT_DIR = resolve(SITE_DIR, "..");
const RESUMES_DIR = join(ROOT_DIR, "resumes");
const OUTPUT_DIR = join(SITE_DIR, "dist");
const OUTPUT_PATH = join(OUTPUT_DIR, "latest.pdf");

// ─── Default Styles (mirrors site/src/utils/constants/default.ts) ───────────

const DEFAULT_STYLES = {
  marginV: 55,
  marginH: 45,
  lineHeight: 1.3,
  paragraphSpace: 5,
  themeColor: "#000000",
  fontCJK: { name: "华康宋体", fontFamily: "HKST" },
  fontEN: { name: "Verdana" },
  fontSize: 12,
  paper: "A4"
};

const PREVIEW_SELECTOR = "#vue-smart-pages-preview";

// Backbone CSS (mirrors site/src/utils/constants/default.ts DEFAULT_CSS_CONTENT)
const DEFAULT_CSS_CONTENT = `/* Backbone CSS for Resume Template 1 */

/* Basic */

${PREVIEW_SELECTOR} {
  background-color: white;
  color: black;
  text-align: left;
  -moz-hyphens: auto;
  -ms-hyphens: auto;
  -webkit-hyphens: auto;
  hyphens: auto;
}

${PREVIEW_SELECTOR} p,
${PREVIEW_SELECTOR} li,
${PREVIEW_SELECTOR} dl {
  margin: 0;
}

/* Headings */

${PREVIEW_SELECTOR} h1,
${PREVIEW_SELECTOR} h2,
${PREVIEW_SELECTOR} h3 {
  font-weight: bold;
}

${PREVIEW_SELECTOR} h1 {
  font-size: 2.5em;
  letter-spacing: 0.1em;
  text-align: center;
  margin-bottom: 0.25em;
}

${PREVIEW_SELECTOR} h2,
${PREVIEW_SELECTOR} h3 {
  margin-bottom: 0.25em;
  margin-top: 1.0em;
  font-size: 1.2em;
}

${PREVIEW_SELECTOR} h1,
${PREVIEW_SELECTOR} h2 {
  border-bottom-style: solid;
  border-bottom-width: 1px;
  border-bottom-color: darkgrey;
}

/* Lists */

${PREVIEW_SELECTOR} ul,
${PREVIEW_SELECTOR} ol {
  padding-left: 1.5em;
  margin: 0.2em 0 1.0em 0;
}

${PREVIEW_SELECTOR} ul {
  list-style-type: disc;
}

${PREVIEW_SELECTOR} ol {
  list-style-type: decimal;
}

/* Definition Lists */

${PREVIEW_SELECTOR} dl {
  display: flex;
}

${PREVIEW_SELECTOR} dl dt,
${PREVIEW_SELECTOR} dl dd:not(:last-child) {
  flex: 1;
}

/* Tex */

${PREVIEW_SELECTOR} :not(span.katex-display) > span.katex {
  font-size: 1em !important;
}

/* SVG & Images */

${PREVIEW_SELECTOR} svg.iconify {
  vertical-align: -0.2em;
}

${PREVIEW_SELECTOR} img {
  max-width: 100%;
}

/* Header */

${PREVIEW_SELECTOR} .resume-header {
  text-align: center;
}

${PREVIEW_SELECTOR} .resume-header h1 {
  text-align: center;
  line-height: 1;
  margin-bottom: 8px;
}

${PREVIEW_SELECTOR} .resume-header-item:not(.no-separator)::after {
  content: " | ";
}

/* Citations */

${PREVIEW_SELECTOR} ul.crossref-list {
  padding-left: 1.2em;
}

${PREVIEW_SELECTOR} li.crossref-item p {
  margin-left: 0.5em;
}

${PREVIEW_SELECTOR} li.crossref-item::marker {
  content: attr(data-caption);
}

${PREVIEW_SELECTOR} sup.crossref-ref {
  font-size: 100%;
  top: 0;
}

/* Dark & print mode */

@media print {
  ${PREVIEW_SELECTOR} {
    background-color: white !important;
    color: black !important;
  }
}
`;

// ─── Markdown Rendering (mirrors site/src/utils/markdown.ts) ────────────────

const md = new MarkdownIt({ html: true });
md.use(MarkdownItDeflist);
md.use(MarkdownItKatex);
md.use(MarkdownItCite);
md.use(MarkdownItLatexCmds);
md.use(LinkAttributes, {
  matcher: (link) => /^https?:\/\//.test(link),
  attrs: { target: "_blank", rel: "noopener" }
});

function resolveDeflist(html) {
  const dlReg = /<dl>([\s\S]*?)<\/dl>/g;
  const dlList = html.match(dlReg);
  if (dlList === null) return html;

  for (const dl of dlList) {
    const newDl = dl.replace(/<\/dd>\n<dt>/g, "</dd>\n</dl>\n<dl>\n<dt>");
    html = html.replace(dl, newDl);
  }
  return html;
}

function resolveHeader(html, frontmatter) {
  let header = "";

  if (frontmatter.name) header += `<h1>${frontmatter.name}</h1>\n`;

  if (frontmatter.header) {
    const n = frontmatter.header.length;
    for (let i = 0; i < n; i++) {
      const item = frontmatter.header[i];
      if (!item) continue;
      header += item.newLine ? "<br>\n" : "";
      header += `<span class="resume-header-item${
        i === n - 1 || frontmatter.header[i + 1].newLine ? " no-separator" : ""
      }">`;
      if (item.link)
        header += `<a href="${item.link}" target="_blank" rel="noopener noreferrer">${item.text}</a>`;
      else header += item.text;
      header += `</span>\n`;
    }
  }

  return `<div class="resume-header">${header}</div>` + html;
}

function extractInnerFrontMatter(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!match) return { attributes: {}, body: content };
  try {
    const attributes = yaml.load(match[1]) || {};
    return { attributes, body: match[2] };
  } catch {
    return { attributes: {}, body: match[2] };
  }
}

function renderMarkdown(mdContent) {
  const { body, attributes } = extractInnerFrontMatter(mdContent);
  let html = md.render(body);
  html = resolveDeflist(html);
  html = resolveHeader(html, attributes);
  return html;
}

// ─── Frontmatter Extraction (mirrors site/src/utils/resumeFiles.ts) ─────────

function extractFrontMatter(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!match) return { attributes: {}, body: content };
  try {
    const attributes = yaml.load(match[1]) || {};
    return { attributes, body: match[2] };
  } catch {
    return { attributes: {}, body: match[2] };
  }
}

// ─── HTML Document Generation (mirrors site/src/components/edit/toolbar/File.vue) ─

function generateHtmlDocument(html, styles, cssContent) {
  const PAPER = {
    A4: { h: 297, w: 210 },
    letter: { h: 279.4, w: 215.9 }
  };
  const MM_TO_PX = 3.78;
  const paper = PAPER[styles.paper] || PAPER.A4;
  const paperWidthPx = Math.floor(paper.w * MM_TO_PX);

  const fontEN = styles.fontEN.fontFamily || styles.fontEN.name;
  const fontCJK = styles.fontCJK.fontFamily || styles.fontCJK.name;

  const dynamicCss = `
    /* Dynamic Styles */
    body {
      font-family: ${fontEN}, ${fontCJK};
      font-size: ${styles.fontSize}px;
      background-color: #f5f5f5;
      color: black;
      margin: 0;
      padding: 20px;
      display: flex;
      justify-content: center;
    }

    ${PREVIEW_SELECTOR} {
      background-color: white;
      width: ${paperWidthPx}px;
      max-width: 100%;
      padding: ${styles.marginV}px ${styles.marginH}px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      box-sizing: border-box;
    }

    :not(.resume-header-item) > a {
      color: ${styles.themeColor};
    }

    h1, h2, h3 {
      color: ${styles.themeColor};
    }

    h1, h2 {
      border-bottom-color: ${styles.themeColor};
    }

    p, li {
      line-height: ${styles.lineHeight.toFixed(2)};
    }

    h2, h3 {
      line-height: ${(styles.lineHeight * 1.154).toFixed(2)};
    }

    dl {
      line-height: ${(styles.lineHeight * 1.038).toFixed(2)};
    }

    h2 {
      margin-top: ${styles.paragraphSpace}px;
    }

    @media print {
      body {
        background-color: white;
        padding: 0;
        margin: 0;
      }

      ${PREVIEW_SELECTOR} {
        width: 100%;
        max-width: none;
        box-shadow: none;
        margin: 0;
        padding: ${styles.marginV}px ${styles.marginH}px;
      }

      @page {
        size: ${styles.paper};
        margin: 0;
      }
    }
  `;

  const fullCss = cssContent + dynamicCss;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Resume</title>
  <script src="https://code.iconify.design/3/3.1.0/iconify.min.js"><\/script>
  <style>
${fullCss}
  </style>
</head>
<body>
  <main id="vue-smart-pages-preview">
${html}
  </main>
</body>
</html>`;
}

// ─── Find the Most Recently Edited Resume ───────────────────────────────────

function findMostRecentResume() {
  if (!existsSync(RESUMES_DIR)) return null;

  // Try git log to find the most recently committed resume file
  try {
    const result = execSync(
      'git log -1 --format="" --name-only --diff-filter=ACMR -- "resumes/*.md"',
      { cwd: ROOT_DIR, encoding: "utf-8" }
    ).trim();

    if (result) {
      const files = result.split("\n").filter(Boolean);
      if (files.length > 0) {
        const fullPath = join(ROOT_DIR, files[0]);
        if (existsSync(fullPath)) return fullPath;
      }
    }
  } catch {
    // git not available or failed, fall through to fallback
  }

  // Fallback: resume IDs are timestamps, so highest ID = most recently created
  const files = readdirSync(RESUMES_DIR).filter((f) => f.endsWith(".md"));
  if (files.length === 0) return null;
  files.sort().reverse();
  return join(RESUMES_DIR, files[0]);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const resumePath = findMostRecentResume();
  if (!resumePath) {
    console.log("No resume files found in resumes/. Skipping PDF generation.");
    return;
  }

  console.log(`Generating PDF from: ${resumePath}`);

  // Read and parse the resume file
  const content = readFileSync(resumePath, "utf-8");
  const { attributes, body } = extractFrontMatter(content);

  // Merge styles with defaults
  const styles = {
    ...DEFAULT_STYLES,
    ...(attributes.styles || {}),
    fontCJK: { ...DEFAULT_STYLES.fontCJK, ...(attributes.styles?.fontCJK || {}) },
    fontEN: { ...DEFAULT_STYLES.fontEN, ...(attributes.styles?.fontEN || {}) }
  };

  // Get custom CSS or use default
  const cssContent = attributes.css || DEFAULT_CSS_CONTENT;

  // Prepare markdown (same as parseResumeFile in resumeFiles.ts)
  const markdownContent = body.trim() ? `---\n---\n\n${body.trim()}\n` : "---\n---\n";

  // Render markdown to HTML
  const html = renderMarkdown(markdownContent);

  // Generate the complete HTML document
  const htmlDocument = generateHtmlDocument(html, styles, cssContent);

  // Ensure output directory exists
  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

  // Launch Puppeteer and generate PDF
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();
  await page.setContent(htmlDocument, { waitUntil: "networkidle0" });

  // Wait for Iconify icons to load (with timeout)
  await page
    .waitForFunction(
      () => {
        const icons = document.querySelectorAll(".iconify");
        return icons.length === 0 || [...icons].every((el) => el.querySelector("svg"));
      },
      { timeout: 10000 }
    )
    .catch(() => {
      console.warn("Warning: Some Iconify icons may not have loaded.");
    });

  // Generate PDF using the print media styles
  const format = styles.paper === "letter" ? "Letter" : "A4";
  await page.pdf({
    path: OUTPUT_PATH,
    format,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    printBackground: true,
    preferCSSPageSize: true
  });

  await browser.close();
  console.log(`PDF generated successfully: ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error("Error generating PDF:", err);
  process.exit(1);
});
