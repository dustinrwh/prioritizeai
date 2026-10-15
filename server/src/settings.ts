import { DEFAULT_SETTINGS, settingsSchema, type Settings } from '@prioritize/shared';
import { db } from './db/index.js';
import { settings } from './db/schema.js';

const TTL_MS = 30_000;
let cache: { at: number; value: Settings } | null = null;

export async function getSettings(): Promise<Settings> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const rows = await db.select().from(settings);
  const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) merged[r.key] = r.value;
  const parsed = settingsSchema.safeParse(merged);
  const value = parsed.success ? parsed.data : DEFAULT_SETTINGS;
  cache = { at: Date.now(), value };
  return value;
}

export async function updateSettings(patch: Partial<Settings>, userId: string): Promise<Settings> {
  for (const [key, value] of Object.entries(patch)) {
    await db
      .insert(settings)
      .values({ key, value, updatedBy: userId })
      .onConflictDoUpdate({ target: settings.key, set: { value, updatedBy: userId, updatedAt: new Date() } });
  }
  cache = null;
  return getSettings();
}

