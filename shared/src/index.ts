import { z } from 'zod';

export const SUBMISSION_TYPES = ['new_project', 'bug_fix', 'feature_request'] as const;
export const USER_TYPES = ['internal', 'external', 'both'] as const;
export const STATUSES = ['needs_review', 'in_review', 'planned', 'done', 'ice_box'] as const;
export const PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;
export const CONFIDENCES = ['high', 'medium', 'low'] as const;

export type SubmissionType = (typeof SUBMISSION_TYPES)[number];
export type UserType = (typeof USER_TYPES)[number];
export type Status = (typeof STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type Confidence = (typeof CONFIDENCES)[number];

export const TYPE_LABELS: Record<SubmissionType, string> = {
  new_project: 'New project',
  bug_fix: 'Bug fix',
  feature_request: 'Feature request',
};
export const USER_TYPE_LABELS: Record<UserType, string> = { internal: 'Internal', external: 'External', both: 'Both' };
export const STATUS_LABELS: Record<Status, string> = {
  needs_review: 'Needs Review',
  in_review: 'In Review',
  planned: 'Planned',
  done: 'Done',
  ice_box: 'Ice Box',
};
export const PRIORITY_LABELS: Record<Priority, string> = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };
export const PRIORITY_RANK: Record<Priority, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date');

export function todayISO(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Form fields on the Submit Idea screen. One definition for client and server. */
export const submissionFieldsSchema = z.object({
  title: z.string().trim().min(5, 'At least 5 characters').max(120, 'At most 120 characters'),
  description: z.string().trim().min(20, 'At least 20 characters').max(5000, 'At most 5,000 characters'),
  type: z.enum(SUBMISSION_TYPES, { message: 'Choose a type' }),
  date_needed_by: isoDate,
  impacted_users: z.coerce.number({ message: 'Enter a number' }).int('Whole numbers only').min(1, 'At least 1'),
  user_type: z.enum(USER_TYPES, { message: 'Choose a user type' }),
  impact_of_delay: z.string().trim().min(20, 'At least 20 characters').max(2000, 'At most 2,000 characters'),
});
export type SubmissionFields = z.infer<typeof submissionFieldsSchema>;

/** Creation additionally requires the needed-by date to be today or later. */
export const createSubmissionSchema = submissionFieldsSchema.refine((v) => v.date_needed_by >= todayISO(), {
  path: ['date_needed_by'],
  message: 'Must be today or later',
});

export const updateSubmissionSchema = submissionFieldsSchema.partial().extend({
  status: z.enum(STATUSES).optional(),
  priority: z.enum(PRIORITIES).nullable().optional(),
  start_date: isoDate.nullable().optional(),
  end_date: isoDate.nullable().optional(),
});
export type UpdateSubmission = z.infer<typeof updateSubmissionSchema>;

export const AI_MODELS = ['gemini-2.5-flash', 'gemini-2.5-pro'] as const;
export const settingsSchema = z.object({
  ai_model: z.enum(AI_MODELS),
  ice_box_resets_priority: z.boolean(),
  allowed_domain: z.string().trim().toLowerCase().max(253).regex(/^([a-z0-9-]+\.)+[a-z]{2,}$|^$/, 'Enter a domain like example.com'),
});
export type Settings = z.infer<typeof settingsSchema>;
export const settingsPatchSchema = settingsSchema.partial().strict();
export const DEFAULT_SETTINGS: Settings = { ai_model: 'gemini-2.5-flash', ice_box_resets_priority: false, allowed_domain: '' };

export const aiSuggestionOutputSchema = z.object({
  priority: z.enum(PRIORITIES),
  confidence: z.enum(CONFIDENCES),
  rationale: z.string().min(1),
});

// ---- API response shapes ----
export interface UserDTO { id: string; email: string; name: string; avatar_url: string | null; role: 'member' | 'admin' }
export interface SubmissionDTO extends SubmissionFields {
  id: string;
  status: Status;
  completed_at: string | null;
  priority: Priority | null;
  start_date: string | null;
  end_date: string | null;
  submitted_by: UserDTO;
  created_at: string;
  updated_at: string;
}
export interface AiSuggestionDTO {
  id: string;
  suggested_priority: Priority;
  confidence: Confidence;
  rationale: string;
  model: string;
  accepted_at: string | null;
  dismissed_at: string | null;
  created_at: string;
}
export interface ActivityDTO {
  id: string;
  actor: Pick<UserDTO, 'id' | 'name' | 'avatar_url'>;
  field: 'status' | 'priority' | 'dates' | 'content' | 'impact';
  old_value: string | null;
  new_value: string | null;
  source: 'user' | 'ai_suggestion';
  created_at: string;
}
export interface SubmissionDetailDTO extends SubmissionDTO {
  ai_suggestion: AiSuggestionDTO | null;
  impact: ImpactDTO | null;
  impact_suggestion: ImpactSuggestionDTO | null;
  activity: ActivityDTO[];
}
export interface ApiError { error: string; fields?: { field: string; message: string }[] }

/** Board sort: priority (unset last), then oldest date_needed_by. */
export function compareForBoard(a: { priority: Priority | null; date_needed_by: string }, b: { priority: Priority | null; date_needed_by: string }) {
  const ra = a.priority ? PRIORITY_RANK[a.priority] : 99;
  const rb = b.priority ? PRIORITY_RANK[b.priority] : 99;
  return ra - rb || a.date_needed_by.localeCompare(b.date_needed_by);
}

// ---- Wins: annual impact estimates for completed initiatives ----
export const IMPACT_LIMITS = { people_impacted: 100_000_000, hours_saved: 100_000_000, cost_reduced: 10_000_000_000, revenue_increased: 10_000_000_000 } as const;

/** Annual estimates a person confirms for a Done initiative. Whole numbers; dollars are whole dollars. */
export const impactSchema = z.object({
  people_impacted: z.coerce.number({ message: 'Enter a number' }).int('Whole numbers only').min(0, 'Cannot be negative').max(IMPACT_LIMITS.people_impacted, 'Too large'),
  hours_saved: z.coerce.number({ message: 'Enter a number' }).int('Whole numbers only').min(0, 'Cannot be negative').max(IMPACT_LIMITS.hours_saved, 'Too large'),
  cost_reduced: z.coerce.number({ message: 'Enter a number' }).int('Whole dollars only').min(0, 'Cannot be negative').max(IMPACT_LIMITS.cost_reduced, 'Too large'),
  revenue_increased: z.coerce.number({ message: 'Enter a number' }).int('Whole dollars only').min(0, 'Cannot be negative').max(IMPACT_LIMITS.revenue_increased, 'Too large'),
});
export type Impact = z.infer<typeof impactSchema>;

export const impactSuggestionOutputSchema = impactSchema.extend({
  confidence: z.enum(CONFIDENCES),
  rationale: z.string().min(1),
});

export const WIN_RANGES = ['30d', '90d', '365d', 'all'] as const;
export type WinRange = (typeof WIN_RANGES)[number];
export const WIN_RANGE_LABELS: Record<WinRange, string> = { '30d': 'Last 30 days', '90d': 'Last 90 days', '365d': 'Last 12 months', all: 'All time' };

export interface ImpactDTO extends Impact {
  confirmed_by: Pick<UserDTO, 'id' | 'name' | 'avatar_url'>;
  confirmed_at: string;
}
export interface ImpactSuggestionDTO extends Impact {
  id: string;
  confidence: Confidence;
  rationale: string;
  model: string;
  created_at: string;
}
export interface WinsDTO {
  range: WinRange;
  totals: Impact & { count: number };
  wins: (SubmissionDTO & { impact: ImpactDTO })[];
  pending: (SubmissionDTO & { impact_suggestion: ImpactSuggestionDTO | null })[];
}
