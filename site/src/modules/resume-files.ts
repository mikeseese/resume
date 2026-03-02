import { defineNuxtModule } from "@nuxt/kit";

export default defineNuxtModule({
  meta: {
    name: "resume-files",
    configKey: "resumeFiles"
  },
  async setup() {
    // Resume files are now fetched directly from GitHub at runtime.
    // This module is kept as a no-op for compatibility.
    console.log("[resume-files] Resumes are loaded from GitHub at runtime");
  }
});
