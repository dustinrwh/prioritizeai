import { DEFAULT_SETTINGS, settingsSchema, type Settings } from '@prioritize/shared';
import { col, nowTs } from './firestore.js';

const TTL_MS = 30_000;
let cache: { at: number; value: Settings } | null = null;
const ref = () => col.settings.doc('app');

export async function getSettings(): Promise<Settings> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const snap = await ref().get();
  const stored = snap.exists ? snap.data()! : {};
  const parsed = settingsSchema.safeParse({ ...DEFAULT_SETTINGS, ...Object.fromEntries(Object.keys(DEFAULT_SETTINGS).filter((k) => k in stored).map((k) => [k, stored[k]])) });
  const value = parsed.success ? parsed.data : DEFAULT_SETTINGS;
  cache = { at: Date.now(), value };
  return value;
}

/** Who changed what and when is kept on the document and in the server log. */
export async function updateSettings(patch: Partial<Settings>, userId: string): Promise<Settings> {
  await ref().set({ ...patch, updated_by: userId, updated_at: nowTs() }, { merge: true });
  cache = null;
  return getSettings();
}
