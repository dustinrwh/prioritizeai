import type { ActivityDTO, AiSuggestionDTO, SubmissionDTO, UserDTO } from '@prioritize/shared';
import type { activity, aiSuggestions, submissions, users } from './db/schema.js';

type User = typeof users.$inferSelect;
type Submission = typeof submissions.$inferSelect;
type Suggestion = typeof aiSuggestions.$inferSelect;
type Activity = typeof activity.$inferSelect;

export const userDTO = (u: User): UserDTO => ({ id: u.id, email: u.email, name: u.name, avatar_url: u.avatarUrl, role: u.role });

export const submissionDTO = (s: Submission, u: User): SubmissionDTO => ({
  id: s.id,
  title: s.title,
  description: s.description,
  type: s.type,
  date_needed_by: s.dateNeededBy,
  impacted_users: s.impactedUsers,
  user_type: s.userType,
  impact_of_delay: s.impactOfDelay,
  status: s.status,
  priority: s.priority,
  start_date: s.startDate,
  end_date: s.endDate,
  submitted_by: userDTO(u),
  created_at: s.createdAt.toISOString(),
  updated_at: s.updatedAt.toISOString(),
});

export const suggestionDTO = (s: Suggestion): AiSuggestionDTO => ({
  id: s.id,
  suggested_priority: s.suggestedPriority,
  confidence: s.confidence,
  rationale: s.rationale,
  model: s.model,
  accepted_at: s.acceptedAt?.toISOString() ?? null,
  dismissed_at: s.dismissedAt?.toISOString() ?? null,
  created_at: s.createdAt.toISOString(),
});

export const activityDTO = (a: Activity, actor: User): ActivityDTO => ({
  id: a.id,
  actor: { id: actor.id, name: actor.name, avatar_url: actor.avatarUrl },
  field: a.field,
  old_value: a.oldValue,
  new_value: a.newValue,
  source: a.source,
  created_at: a.createdAt.toISOString(),
});
