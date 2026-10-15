import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './index.js';
import { settings } from './schema.js';
import { DEFAULT_SETTINGS } from '@prioritize/shared';

const dir = process.env.MIGRATIONS_DIR ?? './migrations';
await migrate(db, { migrationsFolder: dir });
// Seed settings defaults (idempotent).
await db
  .insert(settings)
  .values(Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ key, value })))
  .onConflictDoNothing();
await pool.end();
console.log('migrations applied');
