import 'dotenv/config';
import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3100';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure', locale: 'es-PE', timezoneId: 'America/Lima' },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], storageState: 'playwright/.auth/admin.json' }, dependencies: ['setup'], testIgnore: [/auth\.setup\.ts/, /responsive\.spec\.ts/] },
    { name: 'mobile', use: { ...devices['Pixel 7'], storageState: 'playwright/.auth/admin.json' }, dependencies: ['setup'], testMatch: /responsive\.spec\.ts/ },
  ],
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: 'npm run dev -- -p 3100',
    url: `${baseURL}/login`,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
