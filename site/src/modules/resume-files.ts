import { defineNuxtModule } from "@nuxt/kit";
import { readdir, readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";

export default defineNuxtModule({
  meta: {
    name: "resume-files",
    configKey: "resumeFiles"
  },
  async setup(_options, nuxt) {
    const resumesSourceDir = resolve(nuxt.options.rootDir, "..", "resumes");
    const publicResumesDir = resolve(nuxt.options.srcDir, "public", "resumes");

    const generateResumeManifest = async () => {
      if (!existsSync(resumesSourceDir)) {
        console.warn("[resume-files] No resumes directory found at", resumesSourceDir);
        return;
      }

      // Ensure output directory exists
      await mkdir(publicResumesDir, { recursive: true });

      // Read all .md files
      const files = await readdir(resumesSourceDir);
      const mdFiles = files.filter((f) => f.endsWith(".md"));

      // Generate manifest with file IDs and extract names from frontmatter
      const manifest = [];

      for (const file of mdFiles) {
        const id = file.replace(/\.md$/, "");
        const content = await readFile(join(resumesSourceDir, file), "utf-8");

        // Extract name from frontmatter
        const nameMatch = content.match(/^name:\s*(.+)$/m);
        const name = nameMatch ? nameMatch[1].trim().replace(/^["']|["']$/g, "") : id;

        manifest.push({ id, name });

        // Copy file to public directory
        await copyFile(join(resumesSourceDir, file), join(publicResumesDir, file));
      }

      // Write manifest
      await writeFile(
        join(publicResumesDir, "manifest.json"),
        JSON.stringify(manifest, null, 2)
      );

      console.log(`[resume-files] Generated manifest with ${manifest.length} resume(s)`);
    };

    // Run during build
    nuxt.hook("build:before", generateResumeManifest);

    // Also run during dev
    nuxt.hook("app:resolve", generateResumeManifest);
  }
});
