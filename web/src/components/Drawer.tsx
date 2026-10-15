import {
  PRIORITIES, PRIORITY_LABELS, STATUSES, STATUS_LABELS, TYPE_LABELS, USER_TYPE_LABELS, SUBMISSION_TYPES, USER_TYPES, submissionFieldsSchema,
  type AiSuggestionDTO, type Priority, type Status, type SubmissionDetailDTO,
} from '@prioritize/shared';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { api, ApiFail } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtDate, fmtDateTime } from '../lib/format';
import { useInvalidate, usePatchSubmission, useSubmission } from '../lib/queries';
import PlanModal from './PlanModal';
import { Avatar, PriorityBadge, TypeChip, useToast } from './ui';

const CONF_LABEL = { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence' } as const;

function AiPanel({ s }: { s: SubmissionDetailDTO }) {
  const invalidate = useInvalidate();
  const toast = useToast();
  const sug: AiSuggestionDTO | null = s.ai_suggestion;
  const ask = useMutation({
    mutationFn: () => api<AiSuggestionDTO>(`/submissions/${s.id}/ai-suggest`, { method: 'POST', body: {} }),
    onSuccess: () => invalidate(),
    onError: (e) => toast(e.message, 'error'),
  });
  const act = useMutation({
    mutationFn: (kind: 'accept' | 'dismiss') => api(`/submissions/${s.id}/ai-suggest/${sug!.id}/${kind}`, { method: 'POST', body: {} }),
    onSuccess: (_d, kind) => { invalidate(); if (kind === 'accept') toast('Priority updated from AI suggestion'); },
    onError: (e) => toast(e.message, 'error'),
  });
  const dismissed = !!sug?.dismissed_at;
  const accepted = !!sug?.accepted_at;
  return (
    <section className="rounded-lg border border-line bg-surface-2 p-4" aria-label="AI suggestion">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">AI suggestion</h3>
        <button className="btn !py-1" disabled={ask.isPending} onClick={() => ask.mutate()}>{ask.isPending ? 'Thinking…' : sug ? 'Ask again' : 'Ask AI to prioritize'}</button>
      </div>
      {ask.isError && <p className="err" role="alert">Couldn't get a suggestion, try again</p>}
      {sug ? (
        <div className={dismissed ? 'opacity-50' : ''}>
          <div className="flex items-center gap-2 mb-2">
            <PriorityBadge priority={sug.suggested_priority} />
            <span className="text-xs text-muted">{CONF_LABEL[sug.confidence]}</span>
            {accepted && <span className="text-xs text-success">✓ Accepted</span>}
            {dismissed && <span className="text-xs text-muted">Dismissed</span>}
          </div>
          <p className="text-sm">{sug.rationale}</p>
          <p className="text-xs text-muted mt-2 font-mono">{sug.model} · {fmtDateTime(sug.created_at)}</p>
          {!accepted && !dismissed && (
            <div className="mt-3 flex gap-2">
              <button className="btn btn-primary !py-1" disabled={act.isPending} onClick={() => act.mutate('accept')}>Accept</button>
              <button className="btn !py-1" disabled={act.isPending} onClick={() => act.mutate('dismiss')}>Dismiss</button>
            </div>
          )}
        </div>
      ) : (
        !ask.isError && <p className="text-sm text-muted">Get a suggested priority grounded in impact, users and deadlines. You decide whether to accept it.</p>
      )}
    </section>
  );
}

function EditForm({ s, onDone }: { s: SubmissionDetailDTO; onDone: () => void }) {
  const patch = usePatchSubmission();
  const toast = useToast();
  const [f, setF] = useState({
    title: s.title, description: s.description, type: s.type, date_needed_by: s.date_needed_by,
    impacted_users: String(s.impacted_users), user_type: s.user_type, impact_of_delay: s.impact_of_delay,
  });
  const parsed = submissionFieldsSchema.safeParse(f);
  const errs: Record<string, string> = {};
  if (!parsed.success) for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
  const [server, setServer] = useState<Record<string, string>>({});
  const e = (k: string) => errs[k] || server[k];
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  return (
    <form className="space-y-3" onSubmit={async (ev) => {
      ev.preventDefault();
      if (!parsed.success) return;
      try { await patch.mutateAsync({ id: s.id, patch: parsed.data }); toast('Saved'); onDone(); }
      catch (x) { if (x instanceof ApiFail) { setServer(x.fieldErrors()); toast(x.message, 'error'); } }
    }}>
      <div><label className="label" htmlFor="e-title">Title</label><input id="e-title" className="input" value={f.title} onChange={(x) => set('title', x.target.value)} />{e('title') && <p className="err">{e('title')}</p>}</div>
      <div><label className="label" htmlFor="e-desc">Description</label><textarea id="e-desc" rows={5} className="input" value={f.description} onChange={(x) => set('description', x.target.value)} />{e('description') && <p className="err">{e('description')}</p>}</div>
      <div className="flex gap-4 flex-wrap">{SUBMISSION_TYPES.map((t) => <label key={t} className="text-sm flex gap-1.5"><input type="radio" checked={f.type === t} onChange={() => set('type', t)} />{TYPE_LABELS[t]}</label>)}</div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label" htmlFor="e-date">Date needed by</label><input id="e-date" type="date" className="input font-mono" value={f.date_needed_by} onChange={(x) => set('date_needed_by', x.target.value)} />{e('date_needed_by') && <p className="err">{e('date_needed_by')}</p>}</div>
        <div><label className="label" htmlFor="e-users">Impacted users</label><input id="e-users" type="number" min={1} className="input" value={f.impacted_users} onChange={(x) => set('impacted_users', x.target.value)} />{e('impacted_users') && <p className="err">{e('impacted_users')}</p>}</div>
      </div>
      <div className="flex gap-4">{USER_TYPES.map((t) => <label key={t} className="text-sm flex gap-1.5"><input type="radio" checked={f.user_type === t} onChange={() => set('user_type', t)} />{USER_TYPE_LABELS[t]}</label>)}</div>
      <div><label className="label" htmlFor="e-impact">Impact of delay</label><textarea id="e-impact" rows={3} className="input" value={f.impact_of_delay} onChange={(x) => set('impact_of_delay', x.target.value)} />{e('impact_of_delay') && <p className="err">{e('impact_of_delay')}</p>}</div>
      <div className="flex gap-2"><button className="btn btn-primary" disabled={!parsed.success || patch.isPending}>Save</button><button type="button" className="btn" onClick={onDone}>Cancel</button></div>
    </form>
  );
}

export default function Drawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { user } = useAuth();
  const { data: s, isLoading, isError } = useSubmission(id);
  const patch = usePatchSubmission();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [plan, setPlan] = useState(false);
  const [dates, setDates] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [dateErr, setDateErr] = useState<Record<string, string>>({});

  useEffect(() => { if (s) setDates({ start: s.start_date ?? '', end: s.end_date ?? '' }); }, [s?.start_date, s?.end_date, s?.id]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && !plan && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose, plan]);

  const run = async (p: Parameters<typeof patch.mutateAsync>[0]['patch']) => {
    try { await patch.mutateAsync({ id, patch: p }); return true; }
    catch (e) { if (e instanceof ApiFail) { setDateErr(e.fieldErrors()); toast(e.message, 'error'); } return false; }
  };

  const canEdit = !!s && user?.id === s.submitted_by.id && s.status === 'needs_review';
  const datesChanged = !!s && (dates.start !== (s.start_date ?? '') || dates.end !== (s.end_date ?? ''));

  return (
    <>
      <div className="fixed inset-0 z-30 bg-bg/50 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <aside className="fixed right-0 top-0 bottom-0 z-40 w-[480px] max-w-full border-l border-line bg-surface overflow-y-auto" role="dialog" aria-modal="true" aria-label="Submission details">
        <div className="sticky top-0 bg-surface border-b border-line px-6 py-3 flex items-center justify-between z-10">
          <span className="text-xs text-muted font-mono">{id.slice(0, 8)}</span>
          <button className="btn !py-1" onClick={onClose} aria-label="Close details">Close</button>
        </div>
        {isLoading && <p className="p-6 text-muted">Loading…</p>}
        {isError && <p className="p-6 text-critical">Couldn't load this submission.</p>}
        {s && (
          <div className="p-6 space-y-5">
            {editing ? <EditForm s={s} onDone={() => setEditing(false)} /> : (
              <>
                <div>
                  <h2 className="text-xl font-semibold">{s.title}</h2>
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <TypeChip type={s.type} />
                    <span className="chip">{USER_TYPE_LABELS[s.user_type]} users</span>
                    <span className="chip">{s.impacted_users.toLocaleString()} impacted</span>
                  </div>
                </div>
                <div className="md text-sm"><ReactMarkdown>{s.description}</ReactMarkdown></div>
                <div>
                  <h3 className="label">Impact of delay</h3>
                  <p className="text-sm whitespace-pre-wrap">{s.impact_of_delay}</p>
                </div>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div><dt className="text-muted text-xs">Needed by</dt><dd className="font-mono">{fmtDate(s.date_needed_by)}</dd></div>
                  <div><dt className="text-muted text-xs">Submitted by</dt><dd className="flex items-center gap-2"><Avatar user={s.submitted_by} size={20} />{s.submitted_by.name}</dd></div>
                  <div><dt className="text-muted text-xs">Created</dt><dd className="font-mono">{fmtDateTime(s.created_at)}</dd></div>
                </dl>
                {canEdit && <button className="btn" onClick={() => setEditing(true)}>Edit idea</button>}
              </>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="d-status">Status</label>
                <select id="d-status" className="input" value={s.status} disabled={patch.isPending}
                  onChange={(e) => { const v = e.target.value as Status; if (v === 'planned') setPlan(true); else run({ status: v }); }}>
                  {STATUSES.map((x) => <option key={x} value={x}>{STATUS_LABELS[x]}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="d-priority">Priority</label>
                <select id="d-priority" className="input" value={s.priority ?? ''} disabled={patch.isPending}
                  onChange={(e) => run({ priority: (e.target.value || null) as Priority | null })}>
                  <option value="">Unset</option>
                  {PRIORITIES.map((x) => <option key={x} value={x}>{PRIORITY_LABELS[x]}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="d-start">Start date</label>
                <input id="d-start" type="date" className="input font-mono" value={dates.start} onChange={(e) => setDates((d) => ({ ...d, start: e.target.value }))} />
                {dateErr.start_date && <p className="err">{dateErr.start_date}</p>}
              </div>
              <div>
                <label className="label" htmlFor="d-end">End date</label>
                <input id="d-end" type="date" className="input font-mono" min={dates.start || undefined} value={dates.end} onChange={(e) => setDates((d) => ({ ...d, end: e.target.value }))} />
                {dateErr.end_date && <p className="err">{dateErr.end_date}</p>}
              </div>
            </div>
            {datesChanged && (
              <button className="btn btn-primary" disabled={patch.isPending} onClick={async () => { setDateErr({}); if (await run({ start_date: dates.start || null, end_date: dates.end || null })) toast('Dates saved'); }}>Save dates</button>
            )}

            <AiPanel s={s} />

            <section aria-label="Activity">
              <h3 className="text-sm font-semibold mb-2">Activity</h3>
              {s.activity.length === 0 ? <p className="text-sm text-muted">No changes yet.</p> : (
                <ul className="space-y-2">
                  {s.activity.map((a) => (
                    <li key={a.id} className="text-sm flex gap-2">
                      <Avatar user={a.actor} size={20} />
                      <div>
                        <span className="font-medium">{a.actor.name}</span>{' '}
                        {a.field === 'content' ? <>edited {a.new_value}</> : <>changed {a.field} <span className="font-mono text-muted">{a.old_value ?? 'unset'}</span> → <span className="font-mono">{a.new_value ?? 'unset'}</span></>}
                        {a.source === 'ai_suggestion' && <span className="chip ml-2">via AI suggestion</span>}
                        <div className="text-xs text-muted">{fmtDateTime(a.created_at)}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </aside>
      {plan && s && (
        <PlanModal title={s.title} initialStart={s.start_date} initialEnd={s.end_date} onCancel={() => setPlan(false)}
          onConfirm={async (start, end) => { await patch.mutateAsync({ id, patch: { status: 'planned', start_date: start, end_date: end } }); setPlan(false); }} />
      )}
    </>
  );
}
