import {
  compareForBoard,
  createSubmissionSchema,
  submissionFieldsSchema,
  todayISO,
  updateSubmissionSchema,
  type ApiError,
  type SubmissionDetailDTO,
} from '@prioritize/shared';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ZodError } from 'zod';
import { suggestPriority } from '../ai.js';
import {
  activityCol, col, fs, hoursAgo, newId, nowPlus, nowTs,
  type ActivityDoc, type AiSuggestionDoc, type ImpactSuggestionDoc, type SubmissionDoc,
} from '../firestore.js';
import { activityDTO, impactDTO, impactSuggestionDTO, submissionDTO, suggestionDTO, userDTO } from '../serialize.js';
import { getSettings } from '../settings.js';

const AI_LIMIT_PER_HOUR = 10;
const FORM_KEYS = Object.keys(submissionFieldsSchema.shape);
const UUID = /^[0-9a-f-]{36}$/i;

export const zodFields = (e: ZodError) => e.issues.map((i) => ({ field: String(i.path[0] ?? ''), message: i.message }));
const fail = (reply: FastifyReply, code: number, error: string, fields?: ApiError['fields']) => reply.code(code).send({ error, fields });

export async function loadDetail(id: string): Promise<SubmissionDetailDTO | null> {
  const snap = await col.submissions.doc(id).get();
  if (!snap.exists) return null;
  const s = snap.data() as SubmissionDoc;
  const [sug, isug, acts] = await Promise.all([
    col.aiSuggestions.where('submission_id', '==', id).orderBy('created_at', 'desc').limit(1).get(),
    col.impactSuggestions.where('submission_id', '==', id).orderBy('created_at', 'desc').limit(1).get(),
    activityCol(id).orderBy('created_at', 'desc').get(),
  ]);
  return {
    ...submissionDTO(id, s),
    ai_suggestion: sug.empty ? null : suggestionDTO(sug.docs[0]!.id, sug.docs[0]!.data() as AiSuggestionDoc),
    impact: s.impact ? impactDTO(s.impact) : null,
    impact_suggestion: isug.empty ? null : impactSuggestionDTO(isug.docs[0]!.id, isug.docs[0]!.data() as ImpactSuggestionDoc),
    activity: acts.docs.map((d) => activityDTO(d.id, d.data() as ActivityDoc)),
  };
}

export async function submissionRoutes(app: FastifyInstance) {
  app.get('/api/submissions', async (req) => {
    const q = req.query as { status?: string; priority?: string };
    const snap = await (q.status ? col.submissions.where('status', '==', q.status) : col.submissions).get();
    return snap.docs
      .map((d) => submissionDTO(d.id, d.data() as SubmissionDoc))
      .filter((s) => !q.priority || s.priority === q.priority)
      .sort(compareForBoard);
  });

  app.post('/api/submissions', async (req, reply) => {
    const parsed = createSubmissionSchema.safeParse(req.body);
    if (!parsed.success) return fail(reply, 400, 'Validation failed', zodFields(parsed.error));
    const v = parsed.data;
    const id = newId();
    const t = nowTs();
    const doc: SubmissionDoc = {
      title: v.title,
      description: v.description,
      type: v.type,
      date_needed_by: v.date_needed_by,
      impacted_users: v.impacted_users,
      user_type: v.user_type,
      impact_of_delay: v.impact_of_delay,
      status: 'needs_review',
      priority: null,
      start_date: null,
      end_date: null,
      completed_at: null,
      submitted_by: userDTO(req.user),
      impact: null,
      created_at: t,
      updated_at: t,
    };
    await col.submissions.doc(id).create(doc);
    return reply.code(201).send(submissionDTO(id, doc));
  });

  app.get('/api/submissions/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!UUID.test(id)) return fail(reply, 404, 'Not found');
    const d = await loadDetail(id);
    return d ?? fail(reply, 404, 'Not found');
  });

  app.patch('/api/submissions/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!UUID.test(id)) return fail(reply, 404, 'Not found');
    const parsed = updateSubmissionSchema.safeParse(req.body);
    if (!parsed.success) return fail(reply, 400, 'Validation failed', zodFields(parsed.error));
    const patch = parsed.data;
    const settings = await getSettings();
    const ref = col.submissions.doc(id);

    const result = await fs.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { code: 404, error: 'Not found' } as const;
      const cur = snap.data() as SubmissionDoc;

      const touchesForm = FORM_KEYS.some((k) => (patch as Record<string, unknown>)[k] !== undefined);
      if (touchesForm && (cur.submitted_by.id !== req.user.id || cur.status !== 'needs_review')) {
        return { code: 403, error: 'Only the submitter can edit these fields, and only while the idea is in Needs Review' } as const;
      }
      if (patch.date_needed_by && patch.date_needed_by !== cur.date_needed_by && patch.date_needed_by < todayISO()) {
        return { code: 400, error: 'Validation failed', fields: [{ field: 'date_needed_by', message: 'Must be today or later' }] } as const;
      }

      const status = patch.status ?? cur.status;
      let priority = patch.priority !== undefined ? patch.priority : cur.priority;
      if (status === 'ice_box' && cur.status !== 'ice_box' && patch.priority === undefined && settings.ice_box_resets_priority) priority = null;
      const startDate = patch.start_date !== undefined ? patch.start_date : cur.start_date;
      const endDate = patch.end_date !== undefined ? patch.end_date : cur.end_date;

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

      const actor = { id: req.user.id, name: req.user.name, avatar_url: req.user.avatar_url };
      const log: Omit<ActivityDoc, 'created_at'>[] = [];
      const row = (field: ActivityDoc['field'], old_value: string | null, new_value: string | null) =>
        log.push({ actor, field, old_value, new_value, source: 'user' });
      if (status !== cur.status) row('status', cur.status, status);
      if (priority !== cur.priority) row('priority', cur.priority, priority);
      if (startDate !== cur.start_date || endDate !== cur.end_date) {
        row('dates', `${cur.start_date ?? '—'} to ${cur.end_date ?? '—'}`, `${startDate ?? '—'} to ${endDate ?? '—'}`);
      }
      const formChanges: Record<string, unknown> = {};
      const changedForm: string[] = [];
      for (const k of FORM_KEYS) {
        const nv = (patch as Record<string, unknown>)[k];
        if (nv !== undefined && nv !== (cur as unknown as Record<string, unknown>)[k]) {
          formChanges[k] = nv;
          changedForm.push(k);
        }
      }
      if (changedForm.length) row('content', null, changedForm.join(', '));

      if (log.length) {
        tx.update(ref, {
          ...formChanges, status, priority, start_date: startDate, end_date: endDate, updated_at: nowTs(),
          ...(status === 'done' && cur.status !== 'done' ? { completed_at: nowTs() } : {}),
        });
        log.forEach((l, i) => tx.create(activityCol(id).doc(newId()), { ...l, created_at: nowPlus(i) }));
      }
      return { code: 200 } as const;
    });

    if (result.code !== 200) return fail(reply, result.code, (result as { error: string }).error, (result as { fields?: ApiError['fields'] }).fields);
    return loadDetail(id);
  });

  app.post('/api/submissions/:id/ai-suggest', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!UUID.test(id)) return fail(reply, 404, 'Not found');
    const snap = await col.submissions.doc(id).get();
    if (!snap.exists) return fail(reply, 404, 'Not found');
    const s = snap.data() as SubmissionDoc;

    const recent = await col.aiSuggestions.where('requested_by', '==', req.user.id).where('created_at', '>=', hoursAgo(1)).count().get();
    if (recent.data().count >= AI_LIMIT_PER_HOUR) return fail(reply, 429, `Limit of ${AI_LIMIT_PER_HOUR} AI suggestions per hour reached. Try again later.`);

    const all = await col.submissions.get();
    const settings = await getSettings();
    let out;
    try {
      out = await suggestPriority({
        model: settings.ai_model,
        today: todayISO(),
        submission: {
          title: s.title, description: s.description, type: s.type, date_needed_by: s.date_needed_by,
          impacted_users: s.impacted_users, user_type: s.user_type, impact_of_delay: s.impact_of_delay,
        },
        backlog: all.docs
          .filter((d) => d.id !== id)
          .map((d) => d.data() as SubmissionDoc)
          .map((o) => ({ title: o.title, type: o.type, date_needed_by: o.date_needed_by, impacted_users: o.impacted_users, priority: o.priority })),
      });
    } catch (err) {
      req.log.error({ err }, 'AI suggestion failed');
      return fail(reply, 502, "Couldn't get a suggestion, try again");
    }
    const doc: AiSuggestionDoc = {
      submission_id: id,
      suggested_priority: out.suggestion.priority,
      confidence: out.suggestion.confidence,
      rationale: out.suggestion.rationale,
      model: out.model,
      requested_by: req.user.id,
      accepted_at: null,
      dismissed_at: null,
      created_at: nowTs(),
    };
    const sid = newId();
    await col.aiSuggestions.doc(sid).create(doc);
    return suggestionDTO(sid, doc);
  });

  app.post('/api/submissions/:id/ai-suggest/:sid/accept', async (req, reply) => {
    const { id, sid } = req.params as { id: string; sid: string };
    if (!UUID.test(id) || !UUID.test(sid)) return fail(reply, 404, 'Not found');
    const sugRef = col.aiSuggestions.doc(sid);
    const subRef = col.submissions.doc(id);
    const ok = await fs.runTransaction(async (tx) => {
      const [sugSnap, subSnap] = await Promise.all([tx.get(sugRef), tx.get(subRef)]);
      if (!sugSnap.exists || !subSnap.exists) return false;
      const sug = sugSnap.data() as AiSuggestionDoc;
      if (sug.submission_id !== id) return false;
      const cur = subSnap.data() as SubmissionDoc;
      if (cur.priority !== sug.suggested_priority) {
        tx.update(subRef, { priority: sug.suggested_priority, updated_at: nowTs() });
        tx.create(activityCol(id).doc(newId()), {
          actor: { id: req.user.id, name: req.user.name, avatar_url: req.user.avatar_url },
          field: 'priority', old_value: cur.priority, new_value: sug.suggested_priority, source: 'ai_suggestion', created_at: nowTs(),
        } satisfies ActivityDoc);
      }
      tx.update(sugRef, { accepted_at: nowTs(), dismissed_at: null });
      return true;
    });
    return ok ? loadDetail(id) : fail(reply, 404, 'Not found');
  });

  app.post('/api/submissions/:id/ai-suggest/:sid/dismiss', async (req, reply) => {
    const { id, sid } = req.params as { id: string; sid: string };
    if (!UUID.test(id) || !UUID.test(sid)) return fail(reply, 404, 'Not found');
    const ref = col.aiSuggestions.doc(sid);
    const snap = await ref.get();
    if (!snap.exists || (snap.data() as AiSuggestionDoc).submission_id !== id) return fail(reply, 404, 'Not found');
    await ref.update({ dismissed_at: nowTs() });
    return loadDetail(id);
  });
}
