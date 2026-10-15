import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { BacklogIcon, CalendarIcon, DashboardIcon, SparklesIcon, StackIcon, SubmitIcon } from '../components/icons';
import { Logo, PriorityBadge } from '../components/ui';
import { api, ApiFail } from '../lib/api';
import { useAuth } from '../lib/auth';

declare global {
  interface Window { google?: any }
}

function loadGis(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts) return resolve();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load Google sign-in'));
    document.head.appendChild(s);
  });
}

function SignIn({ id }: { id: string }) {
  const { refresh } = useAuth();
  const nav = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  const { data: cfg } = useQuery({ queryKey: ['auth-config'], queryFn: () => api<{ google_client_id: string | null; dev_auth: boolean }>('/auth/config') });

  useEffect(() => {
    if (!cfg?.google_client_id) return;
    let cancelled = false;
    loadGis()
      .then(() => {
        if (cancelled || !ref.current) return;
        window.google.accounts.id.initialize({
          client_id: cfg.google_client_id,
          callback: async (resp: { credential: string }) => {
            try {
              await api('/auth/google', { method: 'POST', body: { credential: resp.credential } });
              await refresh();
              nav('/dashboard');
            } catch (e) {
              setError(e instanceof ApiFail ? e.message : 'Sign-in failed');
            }
          },
        });
        window.google.accounts.id.renderButton(ref.current, { theme: 'filled_black', size: 'large', text: 'signin_with', shape: 'pill' });
      })
      .catch((e) => setError(e.message));
    return () => { cancelled = true; };
  }, [cfg?.google_client_id]);

  const devLogin = async () => {
    await api('/auth/dev', { method: 'POST', body: { email: 'dev@example.com', name: 'Dev User' } });
    await refresh();
    nav('/dashboard');
  };

  return (
    <div className="flex flex-col items-center gap-3" id={id}>
      <div ref={ref} className="min-h-[44px]" style={{ colorScheme: 'light' }} />
      {cfg && !cfg.google_client_id && <p className="text-xs text-muted">Google sign-in is not configured (set GOOGLE_CLIENT_ID).</p>}
      {cfg?.dev_auth && <button className="btn" onClick={devLogin}>Dev sign-in (local only)</button>}
      {error && <p className="err" role="alert">{error}</p>}
    </div>
  );
}

const benefits = [
  [StackIcon, 'One backlog', 'Every AI request lands in one place, visible to everyone. No more ideas buried in chat threads and inboxes.'],
  [CalendarIcon, 'A visible plan', "A timeline of what's committed and when, so stakeholders see the roadmap without asking for a status update."],
  [SparklesIcon, 'AI-assisted triage', 'A priority suggestion grounded in impact, users and deadlines. The AI proposes; your team decides.'],
] as const;

const steps = [
  [SubmitIcon, 'Submit', 'Anyone shares an idea with the facts that matter: who is affected, how many users, the deadline, and what delay costs.'],
  [BacklogIcon, 'Triage', 'Drag ideas through Needs Review, In Review, Planned, Done and Ice Box. Priorities are set by people, never silently.'],
  [SparklesIcon, 'Ask AI', 'One click returns a suggested priority with a confidence level and a plain-English rationale you can accept or dismiss.'],
  [DashboardIcon, 'Plan', 'Move work to Planned with dates and it appears on the timeline. Mark it Done and it steps out of the way.'],
] as const;

/** Stylised product preview: pure HTML/CSS so the page stays light. */
function ProductPreview() {
  const rows: { title: string; p: 'critical' | 'high' | 'medium' | 'low'; left: number; width: number }[] = [
    { title: 'Checkout crashes on Safari', p: 'critical', left: 4, width: 34 },
    { title: 'Partner support chatbot', p: 'high', left: 26, width: 52 },
    { title: 'Invoice triage with AI', p: 'medium', left: 40, width: 30 },
    { title: 'Weekly sales summary', p: 'low', left: 58, width: 36 },
  ];
  const bg = { critical: 'bg-critical', high: 'bg-high', medium: 'bg-medium', low: 'bg-low' } as const;
  return (
    <div className="relative mx-auto mb-24 mt-14 w-full max-w-4xl" aria-hidden="true">
      <div className="absolute -inset-x-10 -inset-y-8 -z-10 rounded-[3rem] bg-gradient-to-r from-accent/25 via-accent2/20 to-accent/25 blur-3xl" />
      <div className="overflow-hidden rounded-xl border border-line bg-surface text-left">
        <div className="flex items-center gap-1.5 border-b border-line bg-surface-2 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-line" /><span className="h-2.5 w-2.5 rounded-full bg-line" /><span className="h-2.5 w-2.5 rounded-full bg-line" />
          <span className="ml-3 text-xs text-muted">Dashboard</span>
        </div>
        <div className="grid grid-cols-[34%_1fr] sm:grid-cols-[28%_1fr]">
          <div>
            <div className="h-9 border-b border-line bg-surface-2" />
            {rows.map((r) => (
              <div key={r.title} className="flex h-12 items-center gap-2 border-b border-line px-3">
                <span className="flex-1 truncate text-xs sm:text-sm">{r.title}</span>
                <span className="hidden sm:block"><PriorityBadge priority={r.p} /></span>
              </div>
            ))}
          </div>
          <div className="relative border-l border-line">
            <div className="flex h-9 border-b border-line bg-surface-2 text-[11px] text-muted">
              {['Oct', 'Nov', 'Dec', 'Jan'].map((m) => <span key={m} className="flex-1 border-l border-line/60 px-2 pt-2.5 first:border-l-0">{m}</span>)}
            </div>
            {rows.map((r, i) => (
              <div key={r.title} className="relative h-12 border-b border-line/60">
                <div
                  className={`preview-bar absolute top-3 h-6 rounded ${bg[r.p]}`}
                  style={{ left: `${r.left}%`, width: `${r.width}%`, animationDelay: `${0.15 * i}s` }}
                />
              </div>
            ))}
            <div className="absolute bottom-0 top-0 w-0.5 bg-gradient-to-b from-accent to-accent2" style={{ left: '22%' }} />
          </div>
        </div>
      </div>

      <div className="absolute -bottom-24 right-2 w-[17rem] rounded-lg border border-line bg-surface-2 p-4 text-left shadow-none sm:-right-6">
        <div className="mb-2 flex items-center gap-2 text-xs text-muted"><SparklesIcon width={14} height={14} className="text-accent2" />AI suggestion</div>
        <div className="mb-2 flex items-center gap-2"><PriorityBadge priority="critical" /><span className="text-xs text-muted">High confidence</span></div>
        <p className="text-xs leading-relaxed">4,200 external customers are blocked at payment, with revenue at risk every day. This outranks internal requests.</p>
        <div className="mt-3 flex gap-2">
          <span className="rounded-md bg-gradient-to-r from-accent to-accent2 px-3 py-1 text-xs font-medium text-white">Accept</span>
          <span className="rounded-md border border-line px-3 py-1 text-xs text-muted">Dismiss</span>
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  const { user, loading } = useAuth();
  if (!loading && user) return <Navigate to="/dashboard" replace />;
  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden bg-[radial-gradient(ellipse_at_top,#1b2347_0%,#0B0F19_55%)]">
      <header className="mx-auto flex w-full max-w-6xl items-center px-6 py-5"><Logo /></header>
      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-6 pt-12 pb-24 text-center">
          <span className="chip border-accent/40 text-accent">Built for Applied AI teams</span>
          <h1 className="mx-auto mt-5 max-w-3xl text-3xl font-semibold leading-tight sm:text-5xl">Decide what your AI team builds next.</h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-muted">
            Every team has more AI ideas than capacity. Prioritize AI gives you one place to collect them, rank them on evidence instead of volume, and show everyone what is committed and when.
          </p>
          <div className="mt-8"><SignIn id="signin-top" /></div>
          <ProductPreview />
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-20 pt-10">
          <ul className="grid gap-4 sm:grid-cols-3 text-left">
            {benefits.map(([BenefitIcon, t, d]) => (
              <li key={t} className="rounded-lg border border-line bg-surface p-5">
                <span className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-md bg-surface-2 border border-line text-accent">
                  <BenefitIcon width={20} height={20} />
                </span>
                <h2 className="font-semibold">{t}</h2>
                <p className="text-sm text-muted mt-1">{d}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-20" aria-labelledby="how">
          <h2 id="how" className="text-center text-3xl font-semibold">From idea to roadmap in four steps</h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-muted">No setup, no process to learn. The board mirrors how Applied AI work already flows.</p>
          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map(([StepIcon, t, d], i) => (
              <li key={t} className="relative rounded-lg border border-line bg-surface p-5">
                <span className="absolute right-4 top-4 font-mono text-xs text-muted">0{i + 1}</span>
                <span className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-md bg-gradient-to-br from-accent to-accent2 text-white"><StepIcon width={18} height={18} /></span>
                <h3 className="font-semibold">{t}</h3>
                <p className="mt-1 text-sm text-muted">{d}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-20" aria-labelledby="ai">
          <div className="grid items-center gap-10 rounded-2xl border border-line bg-surface p-8 sm:p-12 lg:grid-cols-2">
            <div>
              <span className="chip">AI that proposes, people that decide</span>
              <h2 id="ai" className="mt-4 text-3xl font-semibold">A second opinion on every request</h2>
              <p className="mt-3 text-muted">
                Ask for a suggestion and the model weighs revenue and safety impact, who is affected, how close the deadline is, and what else is in the backlog. You get a priority, a confidence level and a short rationale.
              </p>
              <ul className="mt-5 space-y-2 text-sm">
                {['Never changes a priority on its own', 'Every accepted suggestion is recorded in the activity log', 'Pick the model that fits your budget in Settings'].map((t) => (
                  <li key={t} className="flex items-start gap-2"><span className="mt-0.5 text-success">✓</span>{t}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg border border-line bg-surface-2 p-5 text-left" aria-hidden="true">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold">Support chatbot for partner portal</span>
                <PriorityBadge priority="high" />
              </div>
              <div className="mb-3 flex flex-wrap gap-2"><span className="chip">New project</span><span className="chip">Both user types</span><span className="chip">900 impacted</span></div>
              <div className="rounded-md border border-line bg-surface p-4">
                <div className="mb-2 flex items-center gap-2 text-xs text-muted"><SparklesIcon width={14} height={14} className="text-accent2" />Suggested priority</div>
                <div className="mb-2 flex items-center gap-2"><PriorityBadge priority="high" /><span className="text-xs text-muted">Medium confidence</span></div>
                <p className="text-sm">Partners wait two days for answers and about $60,000 of revenue is at risk this quarter. The deadline is close, so this ranks above internal tooling.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-6 pb-24 text-center">
          <h2 className="text-3xl font-semibold">Ready to rank your backlog?</h2>
          <p className="mt-3 text-muted">Sign in with Google and submit your first idea in under a minute.</p>
          <div className="mt-8"><SignIn id="signin-bottom" /></div>
        </section>
      </main>
      <footer className="px-8 py-5 text-xs text-muted text-center">© {new Date().getFullYear()} Dustin Hill</footer>
    </div>
  );
}
