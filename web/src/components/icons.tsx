import type { ReactNode, SVGProps } from 'react';

function Icon({ children, ...p }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      {children}
    </svg>
  );
}

type P = SVGProps<SVGSVGElement>;

/** Timeline / Gantt bars */
export const DashboardIcon = (p: P) => (
  <Icon {...p}><path d="M3 5h9M7 12h12M3 19h8" /><path d="M16 5h5M15 19h6" /></Icon>
);
/** Kanban columns */
export const BacklogIcon = (p: P) => (
  <Icon {...p}><rect x="3" y="4" width="5" height="16" rx="1.5" /><rect x="10" y="4" width="5" height="10" rx="1.5" /><rect x="17" y="4" width="4" height="13" rx="1.5" /></Icon>
);
/** Lightbulb */
export const SubmitIcon = (p: P) => (
  <Icon {...p}><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z" /></Icon>
);
/** Stacked list: one backlog */
export const StackIcon = (p: P) => (
  <Icon {...p}><path d="m12 3 9 4.5-9 4.5-9-4.5L12 3Z" /><path d="m3 12 9 4.5 9-4.5" /><path d="m3 16.5 9 4.5 9-4.5" /></Icon>
);
/** Calendar: a visible plan */
export const CalendarIcon = (p: P) => (
  <Icon {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /><path d="M8 15h3" /></Icon>
);
/** Sparkles: AI-assisted triage */
export const SparklesIcon = (p: P) => (
  <Icon {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /><path d="m6.3 6.3 2.4 2.4M15.3 15.3l2.4 2.4M17.7 6.3l-2.4 2.4M8.7 15.3l-2.4 2.4" /></Icon>
);

/** Trophy: Wins */
export const TrophyIcon = (p: P) => (
  <Icon {...p}><path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" /><path d="M8 6H5a1 1 0 0 0-1 1c0 2.2 1.6 4 4 4M16 6h3a1 1 0 0 1 1 1c0 2.2-1.6 4-4 4" /><path d="M12 13v4M8 21h8M9.5 17h5" /></Icon>
);
/** People */
export const PeopleIcon = (p: P) => (
  <Icon {...p}><circle cx="9" cy="8" r="3.25" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><path d="M16 5.2a3.25 3.25 0 0 1 0 5.6M18 14.4c1.8.8 3 2.6 3 5.6" /></Icon>
);
/** Clock: hours saved */
export const ClockIcon = (p: P) => (
  <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icon>
);
/** Trending down: costs reduced */
export const TrendDownIcon = (p: P) => (
  <Icon {...p}><path d="m3 7 6 6 4-4 8 8" /><path d="M15 17h6v-6" /></Icon>
);
/** Trending up: revenue increased */
export const TrendUpIcon = (p: P) => (
  <Icon {...p}><path d="m3 17 6-6 4 4 8-8" /><path d="M15 7h6v6" /></Icon>
);
