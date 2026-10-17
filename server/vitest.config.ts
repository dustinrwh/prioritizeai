import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    env: {
      // The test emulator runs on its own port so it never touches `pnpm dev` data.
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:8182',
      GCP_PROJECT: 'demo-prioritize-test',
      SESSION_SECRET: 'test-secret-test-secret-test-secret-123',
      DEV_AUTH: '1',
      AI_PROVIDER: 'mock',
      LOG_LEVEL: 'silent',
    },
    globalSetup: ['test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 60000,
  },
});
