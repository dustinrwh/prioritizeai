import { sql } from 'drizzle-orm';
import { check, date, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ['member', 'admin']);
export const submissionTypeEnum = pgEnum('submission_type', ['new_project', 'bug_fix', 'feature_request']);
export const userTypeEnum = pgEnum('user_type', ['internal', 'external', 'both']);
export const statusEnum = pgEnum('status', ['needs_review', 'in_review', 'planned', 'done', 'ice_box']);
export const priorityEnum = pgEnum('priority', ['critical', 'high', 'medium', 'low']);
export const confidenceEnum = pgEnum('confidence', ['high', 'medium', 'low']);
export const activityFieldEnum = pgEnum('activity_field', ['status', 'priority', 'dates', 'content']);
export const activitySourceEnum = pgEnum('activity_source', ['user', 'ai_suggestion']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  googleSub: text('google_sub').notNull().unique(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  avatarUrl: text('avatar_url'),
  role: roleEnum('role').notNull().default('member'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const submissions = pgTable(
  'submissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    type: submissionTypeEnum('type').notNull(),
    dateNeededBy: date('date_needed_by', { mode: 'string' }).notNull(),
    impactedUsers: integer('impacted_users').notNull(),
    userType: userTypeEnum('user_type').notNull(),
    impactOfDelay: text('impact_of_delay').notNull(),
    status: statusEnum('status').notNull().default('needs_review'),
    priority: priorityEnum('priority'),
    startDate: date('start_date', { mode: 'string' }),
    endDate: date('end_date', { mode: 'string' }),
    submittedBy: uuid('submitted_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('submissions_status_idx').on(t.status),
    index('submissions_planned_start_idx').on(t.startDate).where(sql`${t.status} = 'planned'`),
    check('impacted_users_min', sql`${t.impactedUsers} >= 1`),
    check('planned_requires_dates', sql`${t.status} <> 'planned' OR (${t.startDate} IS NOT NULL AND ${t.endDate} IS NOT NULL)`),
    check('end_after_start', sql`${t.endDate} IS NULL OR ${t.startDate} IS NULL OR ${t.endDate} >= ${t.startDate}`),
  ],
);

export const aiSuggestions = pgTable(
  'ai_suggestions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    submissionId: uuid('submission_id').notNull().references(() => submissions.id),
    suggestedPriority: priorityEnum('suggested_priority').notNull(),
    confidence: confidenceEnum('confidence').notNull(),
    rationale: text('rationale').notNull(),
    model: text('model').notNull(),
    requestedBy: uuid('requested_by').notNull().references(() => users.id),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ai_suggestions_submission_idx').on(t.submissionId), index('ai_suggestions_user_time_idx').on(t.requestedBy, t.createdAt)],
);

export const activity = pgTable(
  'activity',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    submissionId: uuid('submission_id').notNull().references(() => submissions.id),
    actorId: uuid('actor_id').notNull().references(() => users.id),
    field: activityFieldEnum('field').notNull(),
    oldValue: text('old_value'),
    newValue: text('new_value'),
    source: activitySourceEnum('source').notNull().default('user'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('activity_submission_time_idx').on(t.submissionId, t.createdAt.desc())],
);

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedBy: uuid('updated_by').references(() => users.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
