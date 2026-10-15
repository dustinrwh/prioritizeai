import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    env: {
      DATABASE_URL: 'postgres://localhost:5432/prioritize_ai_test',
      SESSION_SECRET: 'test-secret-test-secret-test-secret-123',
      DEV_AUTH: '1',
      AI_PROVIDER: 'mock',
      MIGRATIONS_DIR: './migrations',
      LOG_LEVEL: 'silent',
    },
    globalSetup: ['test/global-setup.ts'],
    fileParallelism: false,
  },
});
