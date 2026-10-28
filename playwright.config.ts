import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3002",
    channel: "msedge",
    headless: true,
  },
  reporter: "list",
});
