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
  // El servidor de pruebas usa un simulador del proveedor de DNI para no consumir el cupo real
  webServer: process.env.E2E_BASE_URL ? undefined : [
    { command: 'node tests/mocks/dni-provider.mjs', url: 'http://127.0.0.1:3199/health', reuseExistingServer: true, timeout: 30_000 },
    {
      command: 'npm run dev -- -p 3100',
      url: `${baseURL}/login`,
      reuseExistingServer: true,
      timeout: 180_000,
      env: { DNI_API_TOKEN: 'test-token', DNI_API_URL: 'http://127.0.0.1:3199/v1/reniec/dni' },
    },
  ],
});
