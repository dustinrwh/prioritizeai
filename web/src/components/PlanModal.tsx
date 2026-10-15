import { useEffect, useRef, useState } from 'react';
import { ApiFail } from '../lib/api';

export default function PlanModal({
  title, initialStart, initialEnd, onCancel, onConfirm,
}: {
  title: string;
  initialStart: string | null;
  initialEnd: string | null;
  onCancel: () => void;
  onConfirm: (start: string, end: string) => Promise<unknown>;
}) {
  const [start, setStart] = useState(initialStart ?? '');
  const [end, setEnd] = useState(initialEnd ?? '');
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => { first.current?.focus(); }, []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onCancel]);

  const local: Record<string, string> = {};
  if (!start) local.start_date = 'Required';
  if (!end) local.end_date = 'Required';
  else if (start && end < start) local.end_date = 'Must be on or after the start date';
  const valid = Object.keys(local).length === 0;

  const submit = async () => {
    setBusy(true);
    try { await onConfirm(start, end); }
    catch (e) { if (e instanceof ApiFail) setErr(e.fieldErrors()); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/70 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="plan-title">
      <div className="w-[420px] rounded-lg border border-line bg-surface p-6">
        <h2 id="plan-title" className="text-xl font-semibold">Plan this project</h2>
        <p className="text-sm text-muted mt-1 mb-4 truncate">{title}</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="plan-start">Start date</label>
            <input ref={first} id="plan-start" type="date" className="input font-mono" value={start} onChange={(e) => setStart(e.target.value)} />
            {(err.start_date) && <p className="err">{err.start_date}</p>}
          </div>
          <div>
            <label className="label" htmlFor="plan-end">End date</label>
            <input id="plan-end" type="date" min={start || undefined} className="input font-mono" value={end} onChange={(e) => setEnd(e.target.value)} />
            {(err.end_date || (end && local.end_date)) && <p className="err">{err.end_date || local.end_date}</p>}
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" disabled={!valid || busy} onClick={submit}>Move to Planned</button>
        </div>
      </div>
    </div>
  );
}
