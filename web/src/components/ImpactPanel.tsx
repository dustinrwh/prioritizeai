import { impactSchema, type SubmissionDetailDTO } from '@prioritize/shared';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { api, ApiFail } from '../lib/api';
import { fmtDateTime, fmtUsdFull } from '../lib/format';
import { useInvalidate } from '../lib/queries';
import { SparklesIcon } from './icons';
import { Avatar, useToast } from './ui';

const FIELDS = [
  ['people_impacted', 'People impacted', ''],
  ['hours_saved', 'Hours saved per year', ''],
  ['cost_reduced', 'Cost reduced per year', '$'],
  ['revenue_increased', 'Revenue increased per year', '$'],
] as const;
type Key = (typeof FIELDS)[number][0];
type Form = Record<Key, string>;

const toForm = (v?: Partial<Record<Key, number>> | null): Form => ({
  people_impacted: String(v?.people_impacted ?? 0),
  hours_saved: String(v?.hours_saved ?? 0),
  cost_reduced: String(v?.cost_reduced ?? 0),
  revenue_increased: String(v?.revenue_increased ?? 0),
});

const CONF = { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence' } as const;

/** Edit and confirm the annual impact of a Done project. The AI proposes; only confirmed numbers count toward Wins. */
export default function ImpactPanel({ s }: { s: SubmissionDetailDTO }) {
  const invalidate = useInvalidate();
  const toast = useToast();
  const sug = s.impact_suggestion;
  // Start from confirmed numbers, else the AI suggestion, else zeros. Re-seed when either changes underneath us.
  const seed = s.impact ?? sug;
  const seedKey = `${s.impact?.confirmed_at ?? ''}|${sug?.id ?? ''}`;
  const [form, setForm] = useState<Form>(() => toForm(seed));
  const [lastSeed, setLastSeed] = useState(seedKey);
  const [server, setServer] = useState<Record<string, string>>({});
  if (seedKey !== lastSeed) {
    setLastSeed(seedKey);
    setForm(toForm(seed));
  }

  const parsed = impactSchema.safeParse(form);
  const errs: Record<string, string> = {};
  if (!parsed.success) for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
  const unchanged = !!s.impact && FIELDS.every(([k]) => String(s.impact![k]) === form[k]);

  const estimate = useMutation({
    mutationFn: () => api(`/submissions/${s.id}/impact-suggest`, { method: 'POST', body: {} }),
    onSuccess: () => invalidate(),
    onError: (e) => toast(e.message, 'error'),
  });
  const confirm = useMutation({
    mutationFn: () => api(`/submissions/${s.id}/impact`, { method: 'PUT', body: parsed.success ? parsed.data : form }),
    onSuccess: () => { toast('Impact confirmed'); invalidate(); },
    onError: (e) => { if (e instanceof ApiFail) { setServer(e.fieldErrors()); toast(e.message, 'error'); } },
  });

  const generating = !sug && !s.impact && !!s.completed_at && Date.now() - Date.parse(s.completed_at) < 60_000;

  return (
    <section className={`rounded-lg border bg-surface-2 p-4 ${s.impact ? 'border-line' : 'border-accent/50'}`} aria-label="Impact">
      <div className="flex items-start justify-between gap-2 mb-1">
        <h3 className="text-sm font-semibold">Impact · annual estimates</h3>
        {s.impact ? (
          <span className="text-xs text-success whitespace-nowrap">✓ Confirmed</span>
        ) : (
          <span className="chip whitespace-nowrap">Awaiting confirmation</span>
        )}
      </div>
      {!s.impact && <p className="mb-3 text-sm">Review these estimates, adjust any numbers, then press <strong>Confirm impact</strong> to add this project to Wins.</p>}
      {s.impact && (
        <p className="mb-3 flex items-center gap-1.5 text-xs text-muted">
          <Avatar user={s.impact.confirmed_by} size={16} /> {s.impact.confirmed_by.name} · {fmtDateTime(s.impact.confirmed_at)}
        </p>
      )}

      <div className="mb-3 rounded-md border border-line bg-surface p-3">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs text-muted"><SparklesIcon width={14} height={14} className="text-accent2" />AI estimate</span>
          <button className="btn !py-1 !px-2 text-xs" disabled={estimate.isPending || generating} onClick={() => estimate.mutate()}>
            {estimate.isPending || generating ? 'Estimating…' : sug ? 'Re-estimate' : 'Estimate with AI'}
          </button>
        </div>
        {sug ? (
          <>
            <p className="text-sm">{sug.rationale}</p>
            <p className="mt-1.5 text-xs text-muted">{CONF[sug.confidence]} · <span className="font-mono">{sug.model}</span></p>
            <button className="mt-2 text-xs text-accent underline" onClick={() => setForm(toForm(sug))}>Use the AI numbers</button>
          </>
        ) : (
          <p className="text-sm text-muted">{generating ? 'Generating an estimate from the impact details…' : 'Get a starting point from the impact details, then adjust the numbers.'}</p>
        )}
      </div>

      <form className="grid grid-cols-2 gap-3" noValidate onSubmit={(e) => { e.preventDefault(); if (parsed.success) confirm.mutate(); }}>
        {FIELDS.map(([k, label, prefix]) => {
          const err = errs[k] || server[k];
          return (
            <div key={k}>
              <label className="label" htmlFor={`imp-${k}`}>{label}</label>
              <div className="relative">
                {prefix && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">{prefix}</span>}
                <input
                  id={`imp-${k}`} type="number" min={0} step={1} inputMode="numeric"
                  className={`input font-mono ${prefix ? 'pl-6' : ''} ${err ? 'input-error' : ''}`}
                  value={form[k]} onChange={(e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setServer((x) => ({ ...x, [k]: '' })); }}
                />
              </div>
              {err && <p className="err">{err}</p>}
            </div>
          );
        })}
        <div className="col-span-2 flex items-center gap-3">
          <button className="btn btn-primary" disabled={!parsed.success || confirm.isPending || unchanged}>{s.impact ? 'Update impact' : 'Confirm impact'}</button>
          {parsed.success && <span className="text-xs text-muted">≈ {fmtUsdFull(parsed.data.cost_reduced + parsed.data.revenue_increased)} per year in dollar impact</span>}
        </div>
      </form>
    </section>
  );
}
