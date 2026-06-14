import { defineConfig, devices } from '@playwright/test';

/**
 * E2E harness (PR0). Each feature agent runs on its own port via E2E_PORT so
 * parallel worktrees don't collide:
 *   E2E_PORT=5181 npx playwright test test/e2e/<feature>.spec.ts
 * The dev server inherits vite.config's COOP/COEP headers (required for WASM).
 */
const PORT = process.env.E2E_PORT ?? '5180';
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './test/e2e',
  testMatch: '**/*.spec.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    headless: true,
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
