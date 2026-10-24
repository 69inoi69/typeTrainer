// Playwright settings for the browser checks in this folder (how to run
// them: CONTRIBUTING.md, "Browser checks").
// The checks start the real Go server from the repo root, as a user would
// run it, so they test the same files GitHub Pages and the server serve.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.mjs",
  // one browser at a time: rounds are typed in real time, and two at once
  // would slow each other on a small CI machine
  workers: 1,
  timeout: 90_000,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3000",
    viewport: { width: 1600, height: 900 },   // a desktop: the typing screen needs a keyboard (AGENTS.md)
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "go run .",
    cwd: "../..",
    url: "http://localhost:3000/api/v1/languages",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
