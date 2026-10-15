import { execSync } from 'node:child_process';

// Applies migrations + seeds settings on the test database before the suite runs.
export default function setup() {
  execSync('npx tsx src/db/migrate.ts', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: 'postgres://localhost:5432/prioritize_ai_test', MIGRATIONS_DIR: './migrations' },
  });
}
