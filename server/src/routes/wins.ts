import { WIN_RANGES, impactSchema, todayISO, type ApiError, type WinRange, type WinsDTO } from '@prioritize/shared';
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { suggestImpact } from '../ai.js';
import { db } from '../db/index.js';
import { activity, impactSuggestions, impacts, submissions, users } from '../db/schema.js';
import { impactDTO, impactSuggestionDTO, submissionDTO } from '../serialize.js';
import { getSettings } from '../settings.js';
import { loadDetail, zodFields } from './submissions.js';

const AI_LIMIT_PER_HOUR = 10;
const RANGE_DAYS: Record<Exclude<WinRange, 'all'>, number> = { '30d': 30, '90d': 90, '365d': 365 };
const UUID = /^[0-9a-f-]{36}$/i;
const fail = (reply: FastifyReply, code: number, error: string, fields?: ApiError['fields']) => reply.code(code).send({ error, fields });

const summary = (i: { peopleImpacted: number; hoursSaved: number; costReduced: number; revenueIncreased: number }) =>
  `people ${i.peopleImpacted} · hours ${i.hoursSaved} · cost $${i.costReduced} · revenue $${i.revenueIncreased}`;

export async function winsRoutes(app: FastifyInstance) {
  app.get('/api/wins', async (req): Promise<WinsDTO> => {
    const q = (req.query as { range?: string }).range;
    const range: WinRange = (WIN_RANGES as readonly string[]).includes(q ?? '') ? (q as WinRange) : '90d';

    const where = [eq(submissions.status, 'done')];
    if (range !== 'all') where.push(gte(submissions.completedAt, new Date(Date.now() - RANGE_DAYS[range] * 86_400_000)));
    const rows = await db
      .select({ s: submissions, u: users })
      .from(submissions)
      .innerJoin(users, eq(users.id, submissions.submittedBy))
      .where(and(...where))
      .orderBy(desc(submissions.completedAt));

    const ids = rows.map((r) => r.s.id);
    const confirmed = ids.length
      ? await db.select({ i: impacts, u: users }).from(impacts).innerJoin(users, eq(users.id, impacts.confirmedBy)).where(inArray(impacts.submissionId, ids))
      : [];
    const byId = new Map(confirmed.map((c) => [c.i.submissionId, c]));

    const pendingIds = ids.filter((id) => !byId.has(id));
    const latest = new Map<string, ReturnType<typeof impactSuggestionDTO>>();
    if (pendingIds.length) {
      const sugs = await db.select().from(impactSuggestions).where(inArray(impactSuggestions.submissionId, pendingIds)).orderBy(desc(impactSuggestions.createdAt));
      for (const s of sugs) if (!latest.has(s.submissionId)) latest.set(s.submissionId, impactSuggestionDTO(s));
    }

    const wins: WinsDTO['wins'] = [];
    const pending: WinsDTO['pending'] = [];
    const totals = { people_impacted: 0, hours_saved: 0, cost_reduced: 0, revenue_increased: 0, count: 0 };
    for (const r of rows) {
      const c = byId.get(r.s.id);
      if (c) {
        wins.push({ ...submissionDTO(r.s, r.u), impact: impactDTO(c.i, c.u) });
        totals.people_impacted += c.i.peopleImpacted;
        totals.hours_saved += c.i.hoursSaved;
        totals.cost_reduced += c.i.costReduced;
        totals.revenue_increased += c.i.revenueIncreased;
        totals.count += 1;
      } else {
        pending.push({ ...submissionDTO(r.s, r.u), impact_suggestion: latest.get(r.s.id) ?? null });
      }
    }
    return { range, totals, wins, pending };
  });

  app.post('/api/submissions/:id/impact-suggest', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!UUID.test(id)) return fail(reply, 404, 'Not found');
    const [s] = await db.select().from(submissions).where(eq(submissions.id, id));
    if (!s) return fail(reply, 404, 'Not found');
    if (s.status !== 'done') return fail(reply, 400, 'Impact is estimated once a project is Done');

    // The automatic suggestion fired when a project moves to Done is free, but only once per project.
    const [{ n: existing } = { n: 0 }] = await db.select({ n: sql<number>`count(*)::int` }).from(impactSuggestions).where(eq(impactSuggestions.submissionId, id));
    const claimedAuto = (req.body as { trigger?: string } | null)?.trigger === 'auto';
    const trigger = claimedAuto && existing === 0 ? 'auto' : 'manual';

    if (trigger === 'manual') {
      const [{ n } = { n: 0 }] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(impactSuggestions)
        .where(and(eq(impactSuggestions.requestedBy, req.user.id), eq(impactSuggestions.trigger, 'manual'), gte(impactSuggestions.createdAt, new Date(Date.now() - 3_600_000))));
      if (n >= AI_LIMIT_PER_HOUR) return fail(reply, 429, `Limit of ${AI_LIMIT_PER_HOUR} AI estimates per hour reached. Try again later.`);
    }

    const settings = await getSettings();
    let out;
    try {
      out = await suggestImpact({
        model: settings.ai_model,
        today: todayISO(),
        submission: {
          title: s.title, description: s.description, type: s.type, date_needed_by: s.dateNeededBy,
          impacted_users: s.impactedUsers, user_type: s.userType, impact_of_delay: s.impactOfDelay,
        },
      });
    } catch (err) {
      req.log.error({ err }, 'AI impact estimate failed');
      return fail(reply, 502, "Couldn't get an estimate, try again");
    }
    const e = out.estimate;
    const [row] = await db
      .insert(impactSuggestions)
      .values({
        submissionId: id, peopleImpacted: e.people_impacted, hoursSaved: e.hours_saved, costReduced: e.cost_reduced, revenueIncreased: e.revenue_increased,
        confidence: e.confidence, rationale: e.rationale, model: out.model, requestedBy: req.user.id, trigger,
      })
      .returning();
    return impactSuggestionDTO(row!);
  });

  // A person confirms (or edits) the annual numbers. Only confirmed numbers count toward Wins totals.
  app.put('/api/submissions/:id/impact', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!UUID.test(id)) return fail(reply, 404, 'Not found');
    const parsed = impactSchema.safeParse(req.body);
    if (!parsed.success) return fail(reply, 400, 'Validation failed', zodFields(parsed.error));
    const v = parsed.data;

    const result = await db.transaction(async (tx) => {
      const [cur] = await tx.select().from(submissions).where(eq(submissions.id, id)).for('update');
      if (!cur) return 404 as const;
      if (cur.status !== 'done') return 400 as const;
      const [prev] = await tx.select().from(impacts).where(eq(impacts.submissionId, id));
      const next = { peopleImpacted: v.people_impacted, hoursSaved: v.hours_saved, costReduced: v.cost_reduced, revenueIncreased: v.revenue_increased };
      await tx
        .insert(impacts)
        .values({ submissionId: id, ...next, confirmedBy: req.user.id })
        .onConflictDoUpdate({ target: impacts.submissionId, set: { ...next, confirmedBy: req.user.id, confirmedAt: new Date() } });
      await tx.insert(activity).values({
        submissionId: id, actorId: req.user.id, field: 'impact', oldValue: prev ? summary(prev) : null, newValue: summary(next),
      });
      return 200 as const;
    });
    if (result === 404) return fail(reply, 404, 'Not found');
    if (result === 400) return fail(reply, 400, 'Impact can only be confirmed for Done projects');
    return loadDetail(id);
  });
}
