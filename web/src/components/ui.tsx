import { PRIORITY_LABELS, TYPE_LABELS, type Priority, type SubmissionType, type UserDTO } from '@prioritize/shared';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

export const PRIORITY_BG: Record<Priority, string> = { critical: 'bg-critical', high: 'bg-high', medium: 'bg-medium', low: 'bg-low' };

export function PriorityBadge({ priority }: { priority: Priority | null }) {
  if (!priority) return <span className="inline-flex rounded-full border border-dashed border-muted px-2 py-0.5 text-xs text-muted">Unset</span>;
  // Dark text on amber/teal keeps 4.5:1; white on red/blue.
  const text = priority === 'high' || priority === 'medium' ? 'text-bg' : 'text-white';
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${PRIORITY_BG[priority]} ${text}`}>{PRIORITY_LABELS[priority]}</span>;
}

export const TypeChip = ({ type }: { type: SubmissionType }) => <span className="chip">{TYPE_LABELS[type]}</span>;

export function Avatar({ user, size = 24 }: { user: Pick<UserDTO, 'name' | 'avatar_url'>; size?: number }) {
  const initials = user.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return user.avatar_url ? (
    <img src={user.avatar_url} alt={user.name} title={user.name} referrerPolicy="no-referrer" width={size} height={size} className="rounded-full" />
  ) : (
    <span title={user.name} style={{ width: size, height: size }} className="inline-flex items-center justify-center rounded-full bg-surface-2 border border-line text-[10px] text-muted">
      {initials}
    </span>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2 font-semibold">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
        <defs>
          <linearGradient id="lg" x1="0" x2="1"><stop offset="0" stopColor="#6C8CFF" /><stop offset="1" stopColor="#9B6CFF" /></linearGradient>
        </defs>
        <rect x="4" y="6" width="24" height="5" rx="2.5" fill="url(#lg)" />
        <rect x="4" y="14" width="17" height="5" rx="2.5" fill="url(#lg)" />
        <rect x="4" y="22" width="10" height="5" rx="2.5" fill="url(#lg)" />
      </svg>
      <span>Prioritize AI</span>
    </span>
  );
}

// ---- toasts ----
const ToastCtx = createContext<(msg: string, kind?: 'ok' | 'error') => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; msg: string; kind: string }[]>([]);
  const push = useCallback((msg: string, kind: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((i) => [...i, { id, msg, kind }]);
    setTimeout(() => setItems((i) => i.filter((t) => t.id !== id)), 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`rounded-md border bg-surface px-4 py-2 text-sm ${t.kind === 'error' ? 'border-critical' : 'border-success'}`}>
            <span className={t.kind === 'error' ? 'text-critical' : 'text-success'}>{t.kind === 'error' ? '! ' : '✓ '}</span>
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
