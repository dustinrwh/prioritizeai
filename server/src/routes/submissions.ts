import {
  compareForBoard,
  createSubmissionSchema,
  submissionFieldsSchema,
  todayISO,
  updateSubmissionSchema,
  type ApiError,
  type SubmissionDetailDTO,
} from '@prioritize/shared';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ZodError } from 'zod';
import { suggestPriority } from '../ai.js';
import { db } from '../db/index.js';
import { activity, aiSuggestions, submissions, users } from '../db/schema.js';
import { activityDTO, submissionDTO, suggestionDTO } from '../serialize.js';
import { getSettings } from '../settings.js';

const AI_LIMIT_PER_HOUR = 10;
const FORM_KEYS = Object.keys(submissionFieldsSchema.shape);

export const zodFields = (e: ZodError) => e.issues.map((i) => ({ field: String(i.path[0] ?? ''), message: i.message }));
const fail = (reply: FastifyReply, code: number, error: string, fields?: ApiError['fields']) => reply.code(code).send({ error, fields });

async function loadDetail(id: string): Promise<SubmissionDetailDTO | null> {
  const [row] = await db
    .select({ s: submissions, u: users })
    .from(submissions)
    .innerJoin(users, eq(users.id, submissions.submittedBy))
    .where(eq(submissions.id, id));
  if (!row) return null;
  const [sug] = await db.select().from(aiSuggestions).where(eq(aiSuggestions.submissionId, id)).orderBy(desc(aiSuggestions.createdAt)).limit(1);
  const acts = await db
    .select({ a: activity, u: users })
    .from(activity)
    .innerJoin(users, eq(users.id, activity.actorId))
    .where(eq(activity.submissionId, id))
    .orderBy(desc(activity.createdAt));
  return {
    ...submissionDTO(row.s, row.u),
    ai_suggestion: sug ? suggestionDTO(sug) : null,
    activity: acts.map((r) => activityDTO(r.a, r.u)),
  };
}

export async function submissionRoutes(app: FastifyInstance) {
  app.get('/api/submissions', async (req) => {
    const q = req.query as { status?: string; priority?: string };
    const where = [];
    if (q.status) where.push(sql`${submissions.status} = ${q.status}`);
    if (q.priority) where.push(sql`${submissions.priority} = ${q.priority}`);
    const rows = await db
      .select({ s: submissions, u: users })
      .from(submissions)
      .innerJoin(users, eq(users.id, submissions.submittedBy))
      .where(where.length ? and(...where) : undefined);
    return rows.map((r) => submissionDTO(r.s, r.u)).sort(compareForBoard);
  });

  app.post('/api/submissions', async (req, reply) => {
    const parsed = createSubmissionSchema.safeParse(req.body);
    if (!parsed.success) return fail(reply, 400, 'Validation failed', zodFields(parsed.error));
    const v = parsed.data;
    const [row] = await db
      .insert(submissions)
      .values({
        title: v.title,
        description: v.description,
        type: v.type,
        dateNeededBy: v.date_needed_by,
        impactedUsers: v.impacted_users,
        userType: v.user_type,
        impactOfDelay: v.impact_of_delay,
        submittedBy: req.user.id,
      })
      .returning();
    return reply.code(201).send(submissionDTO(row!, req.user));
  });

  app.get('/api/submissions/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!/^[0-9a-f-]{36}$/i.test(id)) return fail(reply, 404, 'Not found');
    const d = await loadDetail(id);
    return d ?? fail(reply, 404, 'Not found');
  });

  app.patch('/api/submissions/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!/^[0-9a-f-]{36}$/i.test(id)) return fail(reply, 404, 'Not found');
    const parsed = updateSubmissionSchema.safeParse(req.body);
    if (!parsed.success) return fail(reply, 400, 'Validation failed', zodFields(parsed.error));
    const patch = parsed.data;

    const result = await db.transaction(async (tx) => {
      const [cur] = await tx.select().from(submissions).where(eq(submissions.id, id)).for('update');
      if (!cur) return { code: 404, error: 'Not found' } as const;

      const touchesForm = FORM_KEYS.some((k) => (patch as Record<string, unknown>)[k] !== undefined);
      if (touchesForm && (cur.submittedBy !== req.user.id || cur.status !== 'needs_review')) {
        return { code: 403, error: 'Only the submitter can edit these fields, and only while the idea is in Needs Review' } as const;
      }
      if (patch.date_needed_by && patch.date_needed_by !== cur.dateNeededBy && patch.date_needed_by < todayISO()) {
        return { code: 400, error: 'Validation failed', fields: [{ field: 'date_needed_by', message: 'Must be today or later' }] } as const;
      }

      const settings = await getSettings();
      const status = patch.status ?? cur.status;
      let priority = patch.priority !== undefined ? patch.priority : cur.priority;
      if (status === 'ice_box' && cur.status !== 'ice_box' && patch.priority === undefined && settings.ice_box_resets_priority) priority = null;
      const startDate = patch.start_date !== undefined ? patch.start_date : cur.startDate;
      const endDate = patch.end_date !== undefined ? patch.end_date : cur.endDate;

      if (status === 'planned' && (!startDate || !endDate)) {
        return {
          code: 400,
          error: 'Planned items need a start and end date',
          fields: [
            ...(!startDate ? [{ field: 'start_date', message: 'Required to plan' }] : []),
            ...(!endDate ? [{ field: 'end_date', message: 'Required to plan' }] : []),
          ],
        } as const;
      }
      if (startDate && endDate && endDate < startDate) {
        return { code: 400, error: 'Validation failed', fields: [{ field: 'end_date', message: 'Must be on or after the start date' }] } as const;
      }

      const log: (typeof activity.$inferInsert)[] = [];
      const base = { submissionId: id, actorId: req.user.id };
      if (status !== cur.status) log.push({ ...base, field: 'status', oldValue: cur.status, newValue: status });
      if (priority !== cur.priority) log.push({ ...base, field: 'priority', oldValue: cur.priority, newValue: priority });
      if (startDate !== cur.startDate || endDate !== cur.endDate) {
        log.push({ ...base, field: 'dates', oldValue: `${cur.startDate ?? "—"} to ${cur.endDate ?? "—"}`, newValue: `${startDate ?? "—"} to ${endDate ?? "—"}` });
      }
      const formChanges: Partial<typeof submissions.$inferInsert> = {};
      const changedForm: string[] = [];
      const map = { title: 'title', description: 'description', type: 'type', date_needed_by: 'dateNeededBy', impacted_users: 'impactedUsers', user_type: 'userType', impact_of_delay: 'impactOfDelay' } as const;
      for (const [k, col] of Object.entries(map)) {
        const nv = (patch as Record<string, unknown>)[k];
        if (nv !== undefined && nv !== (cur as Record<string, unknown>)[col]) {
          (formChanges as Record<string, unknown>)[col] = nv;
          changedForm.push(k);
        }
      }
      if (changedForm.length) log.push({ ...base, field: 'content', oldValue: null, newValue: changedForm.join(', ') });

      if (log.length) {
        await tx.update(submissions).set({ ...formChanges, status, priority, startDate, endDate, updatedAt: new Date() }).where(eq(submissions.id, id));
        await tx.insert(activity).values(log);
      }
      return { code: 200 } as const;
    });

    if (result.code !== 200) return fail(reply, result.code, (result as { error: string }).error, (result as { fields?: ApiError['fields'] }).fields);
    return loadDetail(id);
  });

  app.post('/api/submissions/:id/ai-suggest', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!/^[0-9a-f-]{36}$/i.test(id)) return fail(reply, 404, 'Not found');
    const [s] = await db.select().from(submissions).where(eq(submissions.id, id));
    if (!s) return fail(reply, 404, 'Not found');

    const [{ n } = { n: 0 }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(aiSuggestions)
      .where(and(eq(aiSuggestions.requestedBy, req.user.id), gte(aiSuggestions.createdAt, new Date(Date.now() - 3_600_000))));
    if (n >= AI_LIMIT_PER_HOUR) return fail(reply, 429, `Limit of ${AI_LIMIT_PER_HOUR} AI suggestions per hour reached. Try again later.`);

    const others = await db.select().from(submissions).where(sql`${submissions.id} <> ${id}`);
    const settings = await getSettings();
    let out;
    try {
      out = await suggestPriority({
        model: settings.ai_model,
        today: todayISO(),
        submission: {
          title: s.title, description: s.description, type: s.type, date_needed_by: s.dateNeededBy,
          impacted_users: s.impactedUsers, user_type: s.userType, impact_of_delay: s.impactOfDelay,
        },
        backlog: others.map((o) => ({ title: o.title, type: o.type, date_needed_by: o.dateNeededBy, impacted_users: o.impactedUsers, priority: o.priority })),
      });
    } catch (err) {
      req.log.error({ err }, 'AI suggestion failed');
      return fail(reply, 502, "Couldn't get a suggestion, try again");
    }
    const [row] = await db
      .insert(aiSuggestions)
      .values({
        submissionId: id,
        suggestedPriority: out.suggestion.priority,
        confidence: out.suggestion.confidence,
        rationale: out.suggestion.rationale,
        model: out.model,
        requestedBy: req.user.id,
      })
      .returning();
    return suggestionDTO(row!);
  });

  app.post('/api/submissions/:id/ai-suggest/:sid/accept', async (req, reply) => {
    const { id, sid } = req.params as { id: string; sid: string };
    const ok = await db.transaction(async (tx) => {
      const [sug] = await tx.select().from(aiSuggestions).where(and(eq(aiSuggestions.id, sid), eq(aiSuggestions.submissionId, id))).for('update');
      if (!sug) return false;
      const [cur] = await tx.select().from(submissions).where(eq(submissions.id, id)).for('update');
      if (!cur) return false;
      if (cur.priority !== sug.suggestedPriority) {
        await tx.update(submissions).set({ priority: sug.suggestedPriority, updatedAt: new Date() }).where(eq(submissions.id, id));
        await tx.insert(activity).values({
          submissionId: id, actorId: req.user.id, field: 'priority', oldValue: cur.priority, newValue: sug.suggestedPriority, source: 'ai_suggestion',
        });
      }
      await tx.update(aiSuggestions).set({ acceptedAt: new Date(), dismissedAt: null }).where(eq(aiSuggestions.id, sid));
      return true;
    });
    return ok ? loadDetail(id) : fail(reply, 404, 'Not found');
  });

  app.post('/api/submissions/:id/ai-suggest/:sid/dismiss', async (req, reply) => {
    const { id, sid } = req.params as { id: string; sid: string };
    const res = await db
      .update(aiSuggestions)
      .set({ dismissedAt: new Date() })
      .where(and(eq(aiSuggestions.id, sid), eq(aiSuggestions.submissionId, id)))
      .returning({ id: aiSuggestions.id });
    return res.length ? loadDetail(id) : fail(reply, 404, 'Not found');
  });
}
