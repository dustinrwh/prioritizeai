import { compareForBoard, createSubmissionSchema, impactSchema, settingsPatchSchema, todayISO } from '@prioritize/shared';
import { describe, expect, it } from 'vitest';

const valid = {
  title: 'Automate invoices',
  description: 'A description that is long enough to pass.',
  type: 'new_project',
  date_needed_by: todayISO(),
  impacted_users: '10',
  user_type: 'internal',
  impact_of_delay: 'Impact text that is certainly long enough.',
};

describe('createSubmissionSchema', () => {
  it('accepts a valid form and coerces impacted_users', () => {
    const r = createSubmissionSchema.safeParse(valid);
    expect(r.success && r.data.impacted_users).toBe(10);
  });
  it('rejects short fields and past dates with field paths', () => {
    const r = createSubmissionSchema.safeParse({ ...valid, title: 'abc', date_needed_by: '2000-01-01', impacted_users: 0 });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.map((i) => i.path[0]).sort()).toEqual(['date_needed_by', 'impacted_users', 'title']);
  });
});

describe('settings', () => {
  it('rejects unknown models and keys', () => {
    expect(settingsPatchSchema.safeParse({ ai_model: 'gpt-4' }).success).toBe(false);
    expect(settingsPatchSchema.safeParse({ nope: 1 }).success).toBe(false);
    expect(settingsPatchSchema.safeParse({ allowed_domain: 'Example.com' }).success).toBe(true);
  });
});

describe('compareForBoard', () => {
  it('orders by priority, unset last, then oldest needed-by', () => {
    const items = [
      { priority: null, date_needed_by: '2026-01-01' },
      { priority: 'low' as const, date_needed_by: '2026-01-01' },
      { priority: 'critical' as const, date_needed_by: '2026-03-01' },
      { priority: 'critical' as const, date_needed_by: '2026-02-01' },
    ].sort(compareForBoard);
    expect(items.map((i) => i.priority)).toEqual(['critical', 'critical', 'low', null]);
    expect(items[0]!.date_needed_by).toBe('2026-02-01');
  });
});

describe('impactSchema', () => {
  const ok = { people_impacted: '120', hours_saved: 520, cost_reduced: 26000, revenue_increased: 0 };
  it('coerces numeric strings and accepts zero', () => {
    const r = impactSchema.safeParse(ok);
    expect(r.success && r.data.people_impacted).toBe(120);
  });
  it('rejects negatives, fractions and missing fields', () => {
    expect(impactSchema.safeParse({ ...ok, hours_saved: -1 }).success).toBe(false);
    expect(impactSchema.safeParse({ ...ok, cost_reduced: 10.5 }).success).toBe(false);
    expect(impactSchema.safeParse({ ...ok, revenue_increased: undefined }).success).toBe(false);
    expect(impactSchema.safeParse({ ...ok, people_impacted: 1e12 }).success).toBe(false);
  });
});
