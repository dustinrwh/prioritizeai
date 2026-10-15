import { WIN_RANGES, WIN_RANGE_LABELS, TYPE_LABELS, type WinRange } from '@prioritize/shared';
import { useState, type ComponentType, type SVGProps } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Drawer from '../components/Drawer';
import { ClockIcon, PeopleIcon, SparklesIcon, TrendDownIcon, TrendUpIcon, TrophyIcon } from '../components/icons';
import { Avatar } from '../components/ui';
import { fmtCount, fmtCountFull, fmtDate, fmtUsd, fmtUsdFull } from '../lib/format';
import { useWins } from '../lib/queries';

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

function StatBox({ icon: StatIcon, label, value, title, caption }: { icon: IconType; label: string; value: string; title: string; caption: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-5">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-gradient-to-br from-accent to-accent2 text-white"><StatIcon width={18} height={18} /></span>
        <span className="text-sm text-muted">{label}</span>
      </div>
      <div className="mt-4 text-3xl font-semibold tabular-nums" title={title}>{value}</div>
      <div className="mt-1 text-xs text-muted">{caption}</div>
    </div>
  );
}

export default function Wins() {
  const [range, setRange] = useState<WinRange>('90d');
  const { data, isLoading, isError } = useWins(range);
  const [params, setParams] = useSearchParams();
  const openId = params.get('s');
  const t = data?.totals;
  const caption = (what: string) => `${what} · annual estimate`;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2"><TrophyIcon width={22} height={22} className="text-accent" />Wins</h1>
            <p className="text-sm text-muted mt-1">The impact of recently completed initiatives. Only confirmed estimates are counted.</p>
          </div>
          <div className="inline-flex rounded-md border border-line overflow-hidden" role="group" aria-label="Time range">
            {WIN_RANGES.map((r) => (
              <button key={r} aria-pressed={range === r} onClick={() => setRange(r)} className={`px-3 py-1.5 text-sm ${range === r ? 'bg-surface-2 text-ink' : 'text-muted hover:text-ink'}`}>{WIN_RANGE_LABELS[r]}</button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Totals">
          <StatBox icon={PeopleIcon} label="People impacted" value={t ? fmtCount(t.people_impacted) : '—'} title={t ? fmtCountFull(t.people_impacted) : ''} caption={caption(t ? `${t.count} ${t.count === 1 ? 'win' : 'wins'}` : 'wins')} />
          <StatBox icon={ClockIcon} label="Hours saved" value={t ? fmtCount(t.hours_saved) : '—'} title={t ? `${fmtCountFull(t.hours_saved)} hours` : ''} caption={caption('hours per year')} />
          <StatBox icon={TrendDownIcon} label="Costs reduced" value={t ? fmtUsd(t.cost_reduced) : '—'} title={t ? fmtUsdFull(t.cost_reduced) : ''} caption={caption('per year')} />
          <StatBox icon={TrendUpIcon} label="Revenue increased" value={t ? fmtUsd(t.revenue_increased) : '—'} title={t ? fmtUsdFull(t.revenue_increased) : ''} caption={caption('per year')} />
        </div>

        {isError && <p className="text-critical">Couldn't load wins.</p>}

        {!!data?.pending.length && (
          <section className="rounded-lg border border-accent/40 bg-surface p-4" aria-label="Awaiting review">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><SparklesIcon width={16} height={16} className="text-accent2" />Awaiting your review ({data.pending.length})</h2>
            <p className="text-xs text-muted mt-1">These projects are Done. Review the AI estimate, adjust the numbers and confirm to add them to your wins.</p>
            <ul className="mt-3 divide-y divide-line">
              {data.pending.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-2.5">
                  <span className="flex-1 min-w-0 truncate text-sm">{p.title}</span>
                  <span className="hidden sm:inline text-xs text-muted">{p.impact_suggestion ? 'AI estimate ready' : 'No estimate yet'}</span>
                  <span className="hidden sm:inline font-mono text-xs text-muted">{fmtDate(p.completed_at?.slice(0, 10))}</span>
                  <button className="btn !py-1" onClick={() => setParams({ s: p.id })}>Review &amp; confirm</button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-label="Completed initiatives">
          <h2 className="text-sm font-semibold mb-3">Completed initiatives</h2>
          {isLoading ? (
            <p className="text-muted">Loading…</p>
          ) : !data?.wins.length ? (
            <div className="rounded-lg border border-line bg-surface p-10 text-center">
              <p>No confirmed wins in this period yet.</p>
              <p className="text-sm text-muted mt-1">Move a project to Done, then review and confirm its impact.</p>
              <Link to="/backlog" className="text-accent underline mt-3 inline-block">Go to the backlog</Link>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-line bg-surface">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-surface-2 text-left text-xs text-muted">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Initiative</th>
                    <th className="px-3 py-2.5 font-medium">Completed</th>
                    <th className="px-3 py-2.5 font-medium text-right">People</th>
                    <th className="px-3 py-2.5 font-medium text-right">Hours saved</th>
                    <th className="px-3 py-2.5 font-medium text-right">Cost reduced</th>
                    <th className="px-4 py-2.5 font-medium text-right">Revenue increased</th>
                  </tr>
                </thead>
                <tbody>
                  {data.wins.map((w) => (
                    <tr key={w.id} className="border-t border-line hover:bg-surface-2 cursor-pointer" onClick={() => setParams({ s: w.id })}>
                      <td className="px-4 py-3">
                        <button className="flex items-center gap-2 text-left" onClick={(e) => { e.stopPropagation(); setParams({ s: w.id }); }}>
                          <Avatar user={w.submitted_by} size={22} />
                          <span>
                            <span className="block font-medium">{w.title}</span>
                            <span className="text-xs text-muted">{TYPE_LABELS[w.type]}</span>
                          </span>
                        </button>
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-muted whitespace-nowrap">{fmtDate(w.completed_at?.slice(0, 10))}</td>
                      <td className="px-3 py-3 text-right tabular-nums" title={fmtCountFull(w.impact.people_impacted)}>{fmtCount(w.impact.people_impacted)}</td>
                      <td className="px-3 py-3 text-right tabular-nums" title={`${fmtCountFull(w.impact.hours_saved)} hours`}>{fmtCount(w.impact.hours_saved)}</td>
                      <td className="px-3 py-3 text-right tabular-nums" title={fmtUsdFull(w.impact.cost_reduced)}>{fmtUsd(w.impact.cost_reduced)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-success" title={fmtUsdFull(w.impact.revenue_increased)}>{fmtUsd(w.impact.revenue_increased)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted mt-3">All figures are annual estimates confirmed by a team member.</p>
        </section>
      </div>
      {openId && <Drawer id={openId} onClose={() => setParams({})} />}
    </div>
  );
}
