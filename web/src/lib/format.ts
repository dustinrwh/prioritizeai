export const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, m! - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};
export const fmtDateTime = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
export const parseISO = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d));
};
export const DAY = 86_400_000;
export const daysBetween = (a: string, b: string) => Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / DAY);
