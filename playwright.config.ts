import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 60000,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:5174', channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'darwin' ? 'chrome' : 'msedge'), viewport: { width: 1440, height: 1000 }, headless: true, trace: 'retain-on-failure' },
  webServer: [
    { command: 'npx tsx tests/browser/server.ts', url: 'http://127.0.0.1:3002/api/capabilities', env: { APP_ORIGIN: 'http://127.0.0.1:5174' }, reuseExistingServer: false },
    { command: 'npx vite --host 127.0.0.1 --port 5174', url: 'http://127.0.0.1:5174', env: { API_PORT: '3002' }, reuseExistingServer: false },
  ],
});
