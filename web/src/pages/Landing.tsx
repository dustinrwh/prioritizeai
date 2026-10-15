import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Logo } from '../components/ui';
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
      <div ref={ref} className="min-h-[44px]" />
      {cfg && !cfg.google_client_id && <p className="text-xs text-muted">Google sign-in is not configured (set GOOGLE_CLIENT_ID).</p>}
      {cfg?.dev_auth && <button className="btn" onClick={devLogin}>Dev sign-in (local only)</button>}
      {error && <p className="err" role="alert">{error}</p>}
    </div>
  );
}

const benefits = [
  ['One backlog', 'Every AI request in one place, visible to everyone.'],
  ['A visible plan', "A timeline of what's committed and when."],
  ['AI-assisted triage', 'A priority suggestion grounded in impact, users and deadlines.'],
];

export default function Landing() {
  const { user, loading } = useAuth();
  if (!loading && user) return <Navigate to="/dashboard" replace />;
  return (
    <div className="min-h-screen flex flex-col bg-[radial-gradient(ellipse_at_top,#1b2347_0%,#0B0F19_55%)]">
      <header className="px-8 py-5"><Logo /></header>
      <main className="flex-1 flex flex-col items-center px-6 pt-16 pb-12 text-center">
        <h1 className="text-3xl sm:text-5xl font-semibold max-w-3xl leading-tight">Decide what your AI team builds next.</h1>
        <p className="mt-4 text-muted max-w-xl text-base">Submit ideas, see the plan, and let AI help rank the backlog.</p>
        <div className="mt-8"><SignIn id="signin-top" /></div>
        <ul className="mt-16 grid gap-4 sm:grid-cols-3 max-w-4xl w-full text-left">
          {benefits.map(([t, d]) => (
            <li key={t} className="rounded-lg border border-line bg-surface p-5">
              <h2 className="font-semibold">{t}</h2>
              <p className="text-sm text-muted mt-1">{d}</p>
            </li>
          ))}
        </ul>
        <div className="mt-14"><SignIn id="signin-bottom" /></div>
      </main>
      <footer className="px-8 py-5 text-xs text-muted text-center">© {new Date().getFullYear()} Your Company</footer>
    </div>
  );
}
