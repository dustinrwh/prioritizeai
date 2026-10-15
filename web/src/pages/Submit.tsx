import {
  SUBMISSION_TYPES, TYPE_LABELS, USER_TYPES, USER_TYPE_LABELS, createSubmissionSchema, todayISO,
  type SubmissionDTO,
} from '@prioritize/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../components/ui';
import { api, ApiFail } from '../lib/api';

const DRAFT_KEY = 'prioritize-ai:draft';
const empty = { title: '', description: '', type: '', date_needed_by: '', impacted_users: '', user_type: '', impact_of_delay: '' };
type Form = typeof empty;

function loadDraft(): Form {
  try { return { ...empty, ...JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}') }; } catch { return empty; }
}

export default function Submit() {
  const [form, setForm] = useState<Form>(loadDraft);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState(false);
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();

  useEffect(() => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(form)); } catch { /* ignore */ } }, [form]);

  const result = useMemo(() => createSubmissionSchema.safeParse({ ...form, impacted_users: form.impacted_users === '' ? undefined : form.impacted_users }), [form]);
  const errors: Record<string, string> = useMemo(() => {
    const out: Record<string, string> = {};
    if (!result.success) for (const i of result.error.issues) { const k = String(i.path[0]); out[k] ??= i.message; }
    return { ...out, ...serverErrors };
  }, [result, serverErrors]);

  const submit = useMutation({
    mutationFn: () => api<SubmissionDTO>('/submissions', { method: 'POST', body: result.success ? result.data : form }),
    onSuccess: (s) => {
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      qc.invalidateQueries({ queryKey: ['submissions'] });
      toast('Idea submitted');
      nav('/backlog', { state: { highlight: s.id } });
    },
    onError: (e) => {
      if (e instanceof ApiFail && e.body.fields) { setServerErrors(e.fieldErrors()); setTouched(Object.fromEntries(e.body.fields.map((f) => [f.field, true]))); }
      else toast(e.message, 'error');
    },
  });

  const set = (k: keyof Form) => (v: string) => { setForm((f) => ({ ...f, [k]: v })); setServerErrors((s) => ({ ...s, [k]: '' })); };
  const show = (k: string) => (touched[k] ? errors[k] : undefined);
  const blur = (k: string) => () => setTouched((t) => ({ ...t, [k]: true }));
  const cls = (k: string) => `input ${show(k) ? 'input-error' : ''}`;
  const Err = ({ k }: { k: string }) => (show(k) ? <p className="err" id={`${k}-err`} role="alert">{show(k)}</p> : null);

  return (
    <div className="max-w-2xl w-full mx-auto p-8">
      <h1 className="text-xl font-semibold">Submit an idea</h1>
      <p className="text-sm text-muted mt-1 mb-6">Tell the Applied AI team what you need. Ideas start in Needs Review.</p>
      <form className="space-y-5" noValidate onSubmit={(e) => { e.preventDefault(); if (result.success) submit.mutate(); }}>
        <div>
          <label className="label" htmlFor="title">Title</label>
          <input id="title" className={cls('title')} value={form.title} maxLength={120} onChange={(e) => set('title')(e.target.value)} onBlur={blur('title')} aria-describedby="title-err" />
          <Err k="title" />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label className="label" htmlFor="description">Description</label>
            <button type="button" className="text-xs text-accent" onClick={() => setPreview((p) => !p)}>{preview ? 'Edit' : 'Preview markdown'}</button>
          </div>
          {preview ? (
            <div className="md input min-h-[8rem]"><ReactMarkdown>{form.description || '*Nothing to preview*'}</ReactMarkdown></div>
          ) : (
            <textarea id="description" rows={6} className={cls('description')} value={form.description} onChange={(e) => set('description')(e.target.value)} onBlur={blur('description')} />
          )}
          <p className="help">Markdown allowed. {form.description.length}/5,000</p>
          <Err k="description" />
        </div>
        <fieldset>
          <legend className="label">Type</legend>
          <div className="flex gap-5">
            {SUBMISSION_TYPES.map((t) => (
              <label key={t} className="flex items-center gap-2 text-sm"><input type="radio" name="type" checked={form.type === t} onChange={() => { set('type')(t); blur('type')(); }} />{TYPE_LABELS[t]}</label>
            ))}
          </div>
          <Err k="type" />
        </fieldset>
        <div className="grid grid-cols-2 gap-5">
          <div>
            <label className="label" htmlFor="date_needed_by">Date needed by</label>
            <input id="date_needed_by" type="date" min={todayISO()} className={`${cls('date_needed_by')} font-mono`} value={form.date_needed_by} onChange={(e) => set('date_needed_by')(e.target.value)} onBlur={blur('date_needed_by')} />
            <Err k="date_needed_by" />
          </div>
          <div>
            <label className="label" htmlFor="impacted_users">Number of impacted users</label>
            <input id="impacted_users" type="number" min={1} step={1} className={cls('impacted_users')} value={form.impacted_users} onChange={(e) => set('impacted_users')(e.target.value)} onBlur={blur('impacted_users')} />
            <Err k="impacted_users" />
          </div>
        </div>
        <fieldset>
          <legend className="label">Type of users</legend>
          <div className="flex gap-5">
            {USER_TYPES.map((t) => (
              <label key={t} className="flex items-center gap-2 text-sm"><input type="radio" name="user_type" checked={form.user_type === t} onChange={() => { set('user_type')(t); blur('user_type')(); }} />{USER_TYPE_LABELS[t]}</label>
            ))}
          </div>
          <Err k="user_type" />
        </fieldset>
        <div>
          <label className="label" htmlFor="impact_of_delay">Impact of delay</label>
          <textarea id="impact_of_delay" rows={4} className={cls('impact_of_delay')} value={form.impact_of_delay} onChange={(e) => set('impact_of_delay')(e.target.value)} onBlur={blur('impact_of_delay')}
            placeholder="Who is blocked or harmed? How many hours or days are lost per week? How many dollars are at risk or forgone?" />
          <p className="help">Cover three things: human impact (who is blocked or harmed), time impact (hours or days lost per week), revenue impact (dollars at risk or forgone).</p>
          <Err k="impact_of_delay" />
        </div>
        <button className="btn btn-primary" disabled={!result.success || submit.isPending}>{submit.isPending ? 'Submitting…' : 'Submit idea'}</button>
      </form>
    </div>
  );
}
