import { Firestore, Timestamp } from '@google-cloud/firestore';
import { randomUUID } from 'node:crypto';
import type { Confidence, Impact, Priority, SubmissionFields, Status, UserDTO } from '@prioritize/shared';

// On Cloud Run the project and credentials come from the environment. Locally, FIRESTORE_EMULATOR_HOST points the
// client at the emulator, which needs no credentials but does need a project id.
export const fs = new Firestore({
  projectId: process.env.GCP_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT ?? 'demo-prioritize-ai',
  ignoreUndefinedProperties: true,
});

export const col = {
  users: fs.collection('users'),
  submissions: fs.collection('submissions'),
  aiSuggestions: fs.collection('ai_suggestions'),
  impactSuggestions: fs.collection('impact_suggestions'),
  settings: fs.collection('settings'),
};
/** Change history lives under its submission so it can be read in one ordered query. */
export const activityCol = (submissionId: string) => col.submissions.doc(submissionId).collection('activity');

export const newId = () => randomUUID();
export const nowTs = () => Timestamp.now();
/** Timestamp `i` microseconds after now, so rows written in one request keep their order. */
export const nowPlus = (i: number) => {
  const t = Timestamp.now();
  return new Timestamp(t.seconds, Math.min(t.nanoseconds + i * 1000, 999_999_999));
};
export const iso = (t: Timestamp | null | undefined) => (t ? t.toDate().toISOString() : null);
export const hoursAgo = (h: number) => Timestamp.fromMillis(Date.now() - h * 3_600_000);

// ---- stored document shapes (snake_case, matching the API) ----
export interface UserDoc {
  google_sub: string;
  email: string;
  name: string;
  avatar_url: string | null;
  role: 'member' | 'admin';
  created_at: Timestamp;
}
export type AuthedUser = UserDoc & { id: string };

export interface StoredImpact extends Impact {
  confirmed_by: { id: string; name: string; avatar_url: string | null };
  confirmed_at: Timestamp;
}
export interface SubmissionDoc extends SubmissionFields {
  status: Status;
  priority: Priority | null;
  start_date: string | null;
  end_date: string | null;
  completed_at: Timestamp | null;
  /** Snapshot of the submitter, so lists need no join. */
  submitted_by: UserDTO;
  /** Confirmed annual impact, set by a person. */
  impact: StoredImpact | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}
export interface AiSuggestionDoc {
  submission_id: string;
  suggested_priority: Priority;
  confidence: Confidence;
  rationale: string;
  model: string;
  requested_by: string;
  accepted_at: Timestamp | null;
  dismissed_at: Timestamp | null;
  created_at: Timestamp;
}
export interface ImpactSuggestionDoc extends Impact {
  submission_id: string;
  confidence: Confidence;
  rationale: string;
  model: string;
  requested_by: string;
  /** auto = fired when the project moved to Done (free, once per project). */
  trigger: 'auto' | 'manual';
  created_at: Timestamp;
}
export interface ActivityDoc {
  actor: { id: string; name: string; avatar_url: string | null };
  field: 'status' | 'priority' | 'dates' | 'content' | 'impact';
  old_value: string | null;
  new_value: string | null;
  source: 'user' | 'ai_suggestion';
  created_at: Timestamp;
}
