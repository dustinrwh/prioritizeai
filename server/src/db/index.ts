import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? 'postgres://localhost:5432/prioritize_ai' });
export const db = drizzle(pool, { schema });
export type DB = typeof db;
