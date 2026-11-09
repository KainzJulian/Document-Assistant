import { defineConfig } from '@playwright/test';

/**
 * Browser tests of the acceptance criteria. They run against the throwaway stack from
 * `docker-compose.e2e.yml` (`make test-e2e` starts it, creates the admin and removes it again).
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  globalSetup: './e2e/global-setup.ts',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  // One worker: the stack is shared and its single job queue should not be flooded.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e-report' }]],
  use: {
    baseURL: process.env['E2E_URL'] ?? 'http://127.0.0.1:8090',
    viewport: { width: 1440, height: 900 },
    locale: 'de-AT',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
