import { PRIORITY_LABELS, PRIORITY_RANK, TYPE_LABELS, type SubmissionDTO } from '@prioritize/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Drawer from '../components/Drawer';
import { Avatar, PRIORITY_BG, PriorityBadge } from '../components/ui';
import { DAY, daysBetween, fmtDate, parseISO } from '../lib/format';
import { useSubmissions } from '../lib/queries';

type Zoom = 'month' | 'quarter' | 'year';
const PPD: Record<Zoom, number> = { month: 14, quarter: 5, year: 1.6 };
const ROW_H = 44;
const LEFT_W = 280;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const today = () => { const n = new Date(); return iso(new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()))); };

export default function Dashboard() {
  const { data = [], isLoading } = useSubmissions('planned');
  const [zoom, setZoom] = useState<Zoom>('quarter');
  const [params, setParams] = useSearchParams();
  const [tip, setTip] = useState<{ s: SubmissionDTO; x: number; y: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const ppd = PPD[zoom];
  const t0 = today();

  const rows = useMemo(
    () => data.filter((s) => s.start_date && s.end_date).sort((a, b) => a.start_date!.localeCompare(b.start_date!) || PRIORITY_RANK[a.priority ?? 'low'] - PRIORITY_RANK[b.priority ?? 'low'] || (a.priority ? 0 : 1) - (b.priority ? 0 : 1)),
    [data],
  );

  // Axis spans from the first of the month before the earliest start to a bit past the latest end (always includes today +/- a window).
  const axis = useMemo(() => {
    const starts = [t0, ...rows.map((r) => r.start_date!)].sort();
    const ends = [t0, ...rows.map((r) => r.end_date!)].sort();
    const s = parseISO(starts[0]!);
    const e = parseISO(ends[ends.length - 1]!);
    const from = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() - 2, 1));
    const to = new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth() + 7, 1));
    return { from: iso(from), to: iso(to), days: Math.round((to.getTime() - from.getTime()) / DAY) };
  }, [rows, t0]);

  const x = (d: string) => daysBetween(axis.from, d) * ppd;
  const width = axis.days * ppd;

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = Math.max(0, x(t0) - el.clientWidth / 3); // today about one-third from the left
  }, [zoom, axis.from, rows.length > 0]);

  const months = useMemo(() => {
    const out: { label: string; left: number; w: number }[] = [];
    let d = parseISO(axis.from);
    const end = parseISO(axis.to);
    while (d < end) {
      const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
      out.push({ label: d.toLocaleDateString(undefined, { month: 'short', year: zoom === 'month' || d.getUTCMonth() === 0 ? 'numeric' : undefined, timeZone: 'UTC' }), left: x(iso(d)), w: ((next.getTime() - d.getTime()) / DAY) * ppd });
      d = next;
    }
    return out;
  }, [axis, ppd, zoom]);

  const weeks = useMemo(() => {
    if (zoom === 'year') return [] as number[];
    const out: number[] = [];
    const d = parseISO(axis.from);
    d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7)); // Mondays
    const end = parseISO(axis.to);
    for (; d < end; d.setUTCDate(d.getUTCDate() + 7)) out.push(x(iso(d)));
    return out;
  }, [axis, ppd, zoom]);

  const openId = params.get('s');

  return (
    <div className="flex-1 flex flex-col p-6 gap-4 min-h-0">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <div className="inline-flex rounded-md border border-line overflow-hidden" role="group" aria-label="Zoom">
          {(['month', 'quarter', 'year'] as Zoom[]).map((z) => (
            <button key={z} aria-pressed={zoom === z} onClick={() => setZoom(z)} className={`px-3 py-1.5 text-sm capitalize ${zoom === z ? 'bg-surface-2 text-ink' : 'text-muted hover:text-ink'}`}>{z}</button>
          ))}
        </div>
      </div>

      {isLoading ? <p className="text-muted">Loading…</p> : rows.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface p-10 text-center">
          <p>Nothing planned yet. Move a backlog item to Planned to see it here.</p>
          <Link to="/backlog" className="text-accent underline mt-2 inline-block">Go to the backlog</Link>
        </div>
      ) : (
        <div className="flex rounded-lg border border-line bg-surface overflow-hidden">
          <div style={{ width: LEFT_W }} className="shrink-0 border-r border-line">
            <div className="h-14 border-b border-line bg-surface-2 px-4 flex items-end pb-2 text-xs text-muted">Project</div>
            {rows.map((s) => (
              <button key={s.id} onClick={() => setParams({ s: s.id })} style={{ height: ROW_H }} className="w-full flex items-center gap-2 px-4 border-b border-line text-left hover:bg-surface-2">
                <span className="flex-1 truncate text-sm">{s.title}</span>
                <PriorityBadge priority={s.priority} />
                <Avatar user={s.submitted_by} size={20} />
              </button>
            ))}
          </div>
          <div ref={scroller} className="flex-1 overflow-x-auto relative">
            <div style={{ width, minHeight: 56 + rows.length * ROW_H }} className="relative">
              <div className="h-14 border-b border-line bg-surface-2 relative">
                {months.map((m) => (
                  <div key={m.left} style={{ left: m.left, width: m.w }} className="absolute top-0 h-8 px-2 text-xs text-muted border-l border-line flex items-center whitespace-nowrap overflow-hidden">{m.label}</div>
                ))}
                {weeks.map((l) => <div key={l} style={{ left: l }} className="absolute bottom-0 h-2 border-l border-line" />)}
              </div>
              {months.map((m) => <div key={`g${m.left}`} style={{ left: m.left, top: 56 }} className="absolute bottom-0 border-l border-line/50" />)}
              {rows.map((s, i) => {
                const left = x(s.start_date!);
                const w = Math.max((daysBetween(s.start_date!, s.end_date!) + 1) * ppd, 6);
                return (
                  <div key={s.id} style={{ top: 56 + i * ROW_H, height: ROW_H }} className="absolute inset-x-0 border-b border-line/60">
                    <button
                      aria-label={`${s.title}, ${fmtDate(s.start_date)} to ${fmtDate(s.end_date)}`}
                      onClick={() => setParams({ s: s.id })}
                      onMouseEnter={(e) => setTip({ s, x: e.clientX, y: e.clientY })}
                      onMouseMove={(e) => setTip({ s, x: e.clientX, y: e.clientY })}
                      onMouseLeave={() => setTip(null)}
                      style={{ left, width: w, top: 10, height: ROW_H - 20 }}
                      className={`absolute rounded ${s.priority ? PRIORITY_BG[s.priority] : 'bg-muted'} hover:brightness-110`}
                    />
                  </div>
                );
              })}
              <div style={{ left: x(t0), top: 0 }} className="absolute bottom-0 w-0.5 bg-gradient-to-b from-accent to-accent2 pointer-events-none" aria-label="Today"><span className="absolute -top-0 left-1 text-[10px] text-accent bg-surface-2 px-1 rounded">Today</span></div>
            </div>
          </div>
        </div>
      )}
      {tip && (
        <div style={{ left: tip.x + 14, top: tip.y + 14 }} className="fixed z-50 pointer-events-none rounded-md border border-line bg-surface px-3 py-2 text-xs max-w-xs">
          <div className="font-semibold text-sm">{tip.s.title}</div>
          <div className="font-mono text-muted">{fmtDate(tip.s.start_date)} → {fmtDate(tip.s.end_date)}</div>
          <div className="text-muted">{Math.max(1, Math.round((daysBetween(tip.s.start_date!, tip.s.end_date!) + 1) / 7))} wk · {tip.s.priority ? PRIORITY_LABELS[tip.s.priority] : 'Unset'} · {TYPE_LABELS[tip.s.type]}</div>
        </div>
      )}
      {openId && <Drawer id={openId} onClose={() => setParams({})} />}
    </div>
  );
}
