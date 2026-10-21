import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:5174', trace: 'retain-on-failure' },
  webServer: {
    command: 'node server/scripts/browserTestServer.js',
    url: 'http://127.0.0.1:5174/api/health',
    reuseExistingServer: false,
    timeout: 30000,
  },
})
