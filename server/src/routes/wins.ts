import { WIN_RANGES, impactSchema, todayISO, type ApiError, type WinRange, type WinsDTO } from '@prioritize/shared';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { suggestImpact } from '../ai.js';
import { Timestamp } from '@google-cloud/firestore';
import { activityCol, col, fs, hoursAgo, newId, nowTs, type ActivityDoc, type ImpactSuggestionDoc, type StoredImpact, type SubmissionDoc } from '../firestore.js';
import { impactDTO, impactSuggestionDTO, submissionDTO } from '../serialize.js';
import { getSettings } from '../settings.js';
import { loadDetail, zodFields } from './submissions.js';

const AI_LIMIT_PER_HOUR = 10;
const RANGE_DAYS: Record<Exclude<WinRange, 'all'>, number> = { '30d': 30, '90d': 90, '365d': 365 };
const UUID = /^[0-9a-f-]{36}$/i;
const fail = (reply: FastifyReply, code: number, error: string, fields?: ApiError['fields']) => reply.code(code).send({ error, fields });

const summary = (i: { people_impacted: number; hours_saved: number; cost_reduced: number; revenue_increased: number }) =>
  `people ${i.people_impacted} · hours ${i.hours_saved} · cost $${i.cost_reduced} · revenue $${i.revenue_increased}`;

export async function winsRoutes(app: FastifyInstance) {
  // Done projects whose impact nobody has confirmed yet; drives the badge on the Wins tab.
  app.get('/api/wins/pending-count', async () => {
    const snap = await col.submissions.where('status', '==', 'done').where('impact', '==', null).count().get();
    return { count: snap.data().count };
  });

  app.get('/api/wins', async (req): Promise<WinsDTO> => {
    const q = (req.query as { range?: string }).range;
    const range: WinRange = (WIN_RANGES as readonly string[]).includes(q ?? '') ? (q as WinRange) : '90d';

    let query = col.submissions.where('status', '==', 'done');
    if (range !== 'all') query = query.where('completed_at', '>=', Timestamp.fromMillis(Date.now() - RANGE_DAYS[range] * 86_400_000));
    const rows = (await query.orderBy('completed_at', 'desc').get()).docs;

    // Latest AI estimate for done projects nobody has confirmed yet (Firestore "in" takes at most 30 ids).
    const pendingIds = rows.filter((d) => !(d.data() as SubmissionDoc).impact).map((d) => d.id);
    const latest = new Map<string, ReturnType<typeof impactSuggestionDTO>>();
    for (let i = 0; i < pendingIds.length; i += 30) {
      const sugs = await col.impactSuggestions.where('submission_id', 'in', pendingIds.slice(i, i + 30)).orderBy('created_at', 'desc').get();
      for (const d of sugs.docs) {
        const data = d.data() as ImpactSuggestionDoc;
        if (!latest.has(data.submission_id)) latest.set(data.submission_id, impactSuggestionDTO(d.id, data));
      }
    }

    const wins: WinsDTO['wins'] = [];
    const pending: WinsDTO['pending'] = [];
    const totals = { people_impacted: 0, hours_saved: 0, cost_reduced: 0, revenue_increased: 0, count: 0 };
    for (const d of rows) {
      const s = d.data() as SubmissionDoc;
      if (s.impact) {
        wins.push({ ...submissionDTO(d.id, s), impact: impactDTO(s.impact) });
        totals.people_impacted += s.impact.people_impacted;
        totals.hours_saved += s.impact.hours_saved;
        totals.cost_reduced += s.impact.cost_reduced;
        totals.revenue_increased += s.impact.revenue_increased;
        totals.count += 1;
      } else {
        pending.push({ ...submissionDTO(d.id, s), impact_suggestion: latest.get(d.id) ?? null });
      }
    }
    return { range, totals, wins, pending };
  });

  app.post('/api/submissions/:id/impact-suggest', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!UUID.test(id)) return fail(reply, 404, 'Not found');
    const snap = await col.submissions.doc(id).get();
    if (!snap.exists) return fail(reply, 404, 'Not found');
    const s = snap.data() as SubmissionDoc;
    if (s.status !== 'done') return fail(reply, 400, 'Impact is estimated once a project is Done');

    // The automatic estimate fired when a project moves to Done is free, but only once per project.
    const existing = (await col.impactSuggestions.where('submission_id', '==', id).count().get()).data().count;
    const claimedAuto = (req.body as { trigger?: string } | null)?.trigger === 'auto';
    const trigger: 'auto' | 'manual' = claimedAuto && existing === 0 ? 'auto' : 'manual';

    if (trigger === 'manual') {
      const n = (
        await col.impactSuggestions.where('requested_by', '==', req.user.id).where('trigger', '==', 'manual').where('created_at', '>=', hoursAgo(1)).count().get()
      ).data().count;
      if (n >= AI_LIMIT_PER_HOUR) return fail(reply, 429, `Limit of ${AI_LIMIT_PER_HOUR} AI estimates per hour reached. Try again later.`);
    }

    const settings = await getSettings();
    let out;
    try {
      out = await suggestImpact({
        model: settings.ai_model,
        today: todayISO(),
        submission: {
          title: s.title, description: s.description, type: s.type, date_needed_by: s.date_needed_by,
          impacted_users: s.impacted_users, user_type: s.user_type, impact_of_delay: s.impact_of_delay,
        },
      });
    } catch (err) {
      req.log.error({ err }, 'AI impact estimate failed');
      return fail(reply, 502, "Couldn't get an estimate, try again");
    }
    const e = out.estimate;
    const doc: ImpactSuggestionDoc = {
      submission_id: id,
      people_impacted: e.people_impacted, hours_saved: e.hours_saved, cost_reduced: e.cost_reduced, revenue_increased: e.revenue_increased,
      confidence: e.confidence, rationale: e.rationale, model: out.model, requested_by: req.user.id, trigger, created_at: nowTs(),
    };
    const sid = newId();
    await col.impactSuggestions.doc(sid).create(doc);
    return impactSuggestionDTO(sid, doc);
  });

  // A person confirms (or edits) the annual numbers. Only confirmed numbers count toward Wins totals.
  app.put('/api/submissions/:id/impact', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!UUID.test(id)) return fail(reply, 404, 'Not found');
    const parsed = impactSchema.safeParse(req.body);
    if (!parsed.success) return fail(reply, 400, 'Validation failed', zodFields(parsed.error));
    const v = parsed.data;
    const ref = col.submissions.doc(id);

    const result = await fs.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return 404 as const;
      const cur = snap.data() as SubmissionDoc;
      if (cur.status !== 'done') return 400 as const;
      const next: StoredImpact = {
        people_impacted: v.people_impacted, hours_saved: v.hours_saved, cost_reduced: v.cost_reduced, revenue_increased: v.revenue_increased,
        confirmed_by: { id: req.user.id, name: req.user.name, avatar_url: req.user.avatar_url },
        confirmed_at: nowTs(),
      };
      tx.update(ref, { impact: next, updated_at: nowTs() });
      tx.create(activityCol(id).doc(newId()), {
        actor: next.confirmed_by, field: 'impact', old_value: cur.impact ? summary(cur.impact) : null, new_value: summary(next), source: 'user', created_at: nowTs(),
      } satisfies ActivityDoc);
      return 200 as const;
    });
    if (result === 404) return fail(reply, 404, 'Not found');
    if (result === 400) return fail(reply, 400, 'Impact can only be confirmed for Done projects');
    return loadDetail(id);
  });
}
