import type { ActivityDTO, AiSuggestionDTO, ImpactDTO, ImpactSuggestionDTO, SubmissionDTO, UserDTO } from '@prioritize/shared';
import { iso, type ActivityDoc, type AiSuggestionDoc, type AuthedUser, type ImpactSuggestionDoc, type StoredImpact, type SubmissionDoc } from './firestore.js';

export const userDTO = (u: AuthedUser): UserDTO => ({ id: u.id, email: u.email, name: u.name, avatar_url: u.avatar_url, role: u.role });

export const submissionDTO = (id: string, s: SubmissionDoc): SubmissionDTO => ({
  id,
  title: s.title,
  description: s.description,
  type: s.type,
  date_needed_by: s.date_needed_by,
  impacted_users: s.impacted_users,
  user_type: s.user_type,
  impact_of_delay: s.impact_of_delay,
  status: s.status,
  completed_at: iso(s.completed_at),
  priority: s.priority,
  start_date: s.start_date,
  end_date: s.end_date,
  submitted_by: s.submitted_by,
  created_at: iso(s.created_at)!,
  updated_at: iso(s.updated_at)!,
});

export const suggestionDTO = (id: string, s: AiSuggestionDoc): AiSuggestionDTO => ({
  id,
  suggested_priority: s.suggested_priority,
  confidence: s.confidence,
  rationale: s.rationale,
  model: s.model,
  accepted_at: iso(s.accepted_at),
  dismissed_at: iso(s.dismissed_at),
  created_at: iso(s.created_at)!,
});

export const activityDTO = (id: string, a: ActivityDoc): ActivityDTO => ({
  id,
  actor: a.actor,
  field: a.field,
  old_value: a.old_value,
  new_value: a.new_value,
  source: a.source,
  created_at: iso(a.created_at)!,
});

export const impactDTO = (i: StoredImpact): ImpactDTO => ({
  people_impacted: i.people_impacted,
  hours_saved: i.hours_saved,
  cost_reduced: i.cost_reduced,
  revenue_increased: i.revenue_increased,
  confirmed_by: i.confirmed_by,
  confirmed_at: iso(i.confirmed_at)!,
});

export const impactSuggestionDTO = (id: string, s: ImpactSuggestionDoc): ImpactSuggestionDTO => ({
  id,
  people_impacted: s.people_impacted,
  hours_saved: s.hours_saved,
  cost_reduced: s.cost_reduced,
  revenue_increased: s.revenue_increased,
  confidence: s.confidence,
  rationale: s.rationale,
  model: s.model,
  created_at: iso(s.created_at)!,
});
