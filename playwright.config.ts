import { defineConfig } from '@playwright/test';
const webPort = process.env.TEST_WEB_PORT || '5174', apiPort = process.env.TEST_API_PORT || '3002';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 60000,
  workers: 1,
  use: { baseURL: `http://127.0.0.1:${webPort}`, channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'darwin' ? 'chrome' : 'msedge'), viewport: { width: 1440, height: 1000 }, headless: true, trace: 'retain-on-failure' },
  webServer: [
    { command: 'npx tsx tests/browser/server.ts', url: `http://127.0.0.1:${apiPort}/api/capabilities`, env: { APP_ORIGIN: `http://127.0.0.1:${webPort}` }, reuseExistingServer: false },
    { command: `npx vite --host 127.0.0.1 --port ${webPort}`, url: `http://127.0.0.1:${webPort}`, env: { API_PORT: apiPort }, reuseExistingServer: false },
  ],
});
