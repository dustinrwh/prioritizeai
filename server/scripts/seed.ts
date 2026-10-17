// Loads sample ideas into the LOCAL Firestore emulator. Refuses to run against a real database.
import { createSubmissionSchema } from '@prioritize/shared';
import { upsertUser } from '../src/auth.js';
import { col, fs, newId, nowTs, type SubmissionDoc } from '../src/firestore.js';
import { userDTO } from '../src/serialize.js';
import { sampleIdeas } from './sample-ideas.js';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('Refusing to seed: FIRESTORE_EMULATOR_HOST is not set, so this would write to a real database.');
  process.exit(1);
}

const user = userDTO(await upsertUser({ sub: 'dev:dev@example.com', email: 'dev@example.com', name: 'Dev User' }));
for (const idea of sampleIdeas) {
  const v = createSubmissionSchema.parse({ ...idea });
  const exists = await col.submissions.where('title', '==', v.title).limit(1).get();
  if (!exists.empty) { console.log('skip (exists):', v.title); continue; }
  const t = nowTs();
  const doc: SubmissionDoc = {
    ...v, status: 'needs_review', priority: null, start_date: null, end_date: null, completed_at: null, submitted_by: user, impact: null, created_at: t, updated_at: t,
  };
  await col.submissions.doc(newId()).create(doc);
  console.log('added:', v.title);
}
await fs.terminate();
