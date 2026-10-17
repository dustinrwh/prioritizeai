import { addDays } from './util.js';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { Timestamp } from '@google-cloud/firestore';
import { col, fs } from '../src/firestore.js';
import { updateSettings } from '../src/settings.js';

let app: FastifyInstance;
const cookies = new Map<string, string>();

async function login(email: string) {
  const res = await app.inject({ method: 'POST', url: '/api/auth/dev', payload: { email, name: email.split('@')[0] } });
  cookies.set(email, String(res.headers['set-cookie']).split(';')[0]!);
  return res.json();
}
const as = (email: string) => ({ cookie: cookies.get(email)! });
const body = (over = {}) => ({
  title: 'Test submission', description: 'Long enough description for the form.', type: 'bug_fix',
  date_needed_by: addDays(10), impacted_users: 50, user_type: 'external', impact_of_delay: 'Customers are blocked and revenue is at risk.', ...over,
});
async function create(email: string, over = {}) {
  const r = await app.inject({ method: 'POST', url: '/api/submissions', headers: as(email), payload: body(over) });
  expect(r.statusCode).toBe(201);
  return r.json();
}
const patch = (email: string, id: string, payload: object) => app.inject({ method: 'PATCH', url: `/api/submissions/${id}`, headers: as(email), payload });

beforeAll(async () => {
  app = await buildApp();
});
afterAll(async () => {
  await app.close();
  await fs.terminate();
});
beforeEach(async () => {
  // Wipe the whole emulator database between tests.
  await fetch('http://127.0.0.1:8182/emulator/v1/projects/demo-prioritize-test/databases/(default)/documents', { method: 'DELETE' });
  await updateSettings({ ai_model: 'gemini-2.5-flash', ice_box_resets_priority: false, allowed_domain: '' }, (await login('admin@x.com')).id);
  await login('a@x.com');
  await login('b@x.com');
});

describe('auth', () => {
  it('returns 401 without a session and serves healthz openly', async () => {
    expect((await app.inject({ url: '/api/submissions' })).statusCode).toBe(401);
    expect((await app.inject({ url: '/api/me' })).statusCode).toBe(401);
    expect((await app.inject({ url: '/healthz' })).statusCode).toBe(200);
  });
});

describe('submissions', () => {
  it('creates in needs_review with no priority and returns field errors for bad input', async () => {
    const s = await create('a@x.com');
    expect(s.status).toBe('needs_review');
    expect(s.priority).toBeNull();
    const bad = await app.inject({ method: 'POST', url: '/api/submissions', headers: as('a@x.com'), payload: body({ title: 'x', date_needed_by: '2000-01-01' }) });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().fields.map((f: { field: string }) => f.field)).toEqual(expect.arrayContaining(['title', 'date_needed_by']));
  });

  it('rejects planned without dates and with end before start; accepts valid dates; logs activity', async () => {
    const s = await create('a@x.com');
    expect((await patch('b@x.com', s.id, { status: 'planned' })).statusCode).toBe(400);
    expect((await patch('b@x.com', s.id, { status: 'planned', start_date: '2026-12-10', end_date: '2026-12-01' })).statusCode).toBe(400);
    const ok = await patch('b@x.com', s.id, { status: 'planned', start_date: '2026-12-01', end_date: '2026-12-20', priority: 'high' });
    expect(ok.statusCode).toBe(200);
    const d = ok.json();
    expect(d.status).toBe('planned');
    expect(d.activity.map((a: { field: string }) => a.field).sort()).toEqual(['dates', 'priority', 'status']);
    const planned = await app.inject({ url: '/api/submissions?status=planned', headers: as('a@x.com') });
    expect(planned.json()).toHaveLength(1);
  });

  it('keeps dates when leaving planned', async () => {
    const s = await create('a@x.com');
    await patch('b@x.com', s.id, { status: 'planned', start_date: '2026-12-01', end_date: '2026-12-20' });
    const r = (await patch('b@x.com', s.id, { status: 'in_review' })).json();
    expect(r.start_date).toBe('2026-12-01');
    expect(r.end_date).toBe('2026-12-20');
  });

  it('moves done items off the dashboard but keeps their dates', async () => {
    const s = await create('a@x.com');
    await patch('b@x.com', s.id, { status: 'planned', start_date: '2026-12-01', end_date: '2026-12-20' });
    const r = await patch('b@x.com', s.id, { status: 'done' });
    expect(r.statusCode).toBe(200);
    expect(r.json().start_date).toBe('2026-12-01');
    expect((await app.inject({ url: '/api/submissions?status=planned', headers: as('a@x.com') })).json()).toHaveLength(0);
    expect((await app.inject({ url: '/api/submissions?status=done', headers: as('a@x.com') })).json()).toHaveLength(1);
  });

  it('lets only the submitter edit form fields, and only in needs_review', async () => {
    const s = await create('a@x.com');
    expect((await patch('b@x.com', s.id, { title: 'Someone else edits' })).statusCode).toBe(403);
    expect((await patch('a@x.com', s.id, { title: 'Edited by owner' })).json().title).toBe('Edited by owner');
    await patch('b@x.com', s.id, { status: 'in_review' });
    expect((await patch('a@x.com', s.id, { title: 'Too late to edit' })).statusCode).toBe(403);
    expect((await patch('b@x.com', s.id, { priority: 'low' })).statusCode).toBe(200);
  });

  it('honours the ice_box_resets_priority setting', async () => {
    const keep = await create('a@x.com');
    await patch('b@x.com', keep.id, { priority: 'high' });
    expect((await patch('b@x.com', keep.id, { status: 'ice_box' })).json().priority).toBe('high');

    await updateSettings({ ice_box_resets_priority: true }, (await login('b@x.com')).id);
    const reset = await create('a@x.com');
    await patch('b@x.com', reset.id, { priority: 'high' });
    const r = (await patch('b@x.com', reset.id, { status: 'ice_box' })).json();
    expect(r.priority).toBeNull();
    expect(r.activity.some((a: { field: string; new_value: string | null }) => a.field === 'priority' && a.new_value === null)).toBe(true);
  });
});

describe('AI suggestions', () => {
  it('proposes without changing priority; accept applies it with source=ai_suggestion', async () => {
    const s = await create('a@x.com');
    const sug = (await app.inject({ method: 'POST', url: `/api/submissions/${s.id}/ai-suggest`, headers: as('b@x.com'), payload: {} })).json();
    expect(['critical', 'high', 'medium', 'low']).toContain(sug.suggested_priority);
    expect((await app.inject({ url: `/api/submissions/${s.id}`, headers: as('a@x.com') })).json().priority).toBeNull();
    const acc = await app.inject({ method: 'POST', url: `/api/submissions/${s.id}/ai-suggest/${sug.id}/accept`, headers: as('b@x.com'), payload: {} });
    const d = acc.json();
    expect(d.priority).toBe(sug.suggested_priority);
    expect(d.ai_suggestion.accepted_at).not.toBeNull();
    expect(d.activity[0].source).toBe('ai_suggestion');
  });

  it('dismiss marks the suggestion without changing priority', async () => {
    const s = await create('a@x.com');
    const sug = (await app.inject({ method: 'POST', url: `/api/submissions/${s.id}/ai-suggest`, headers: as('b@x.com'), payload: {} })).json();
    const d = (await app.inject({ method: 'POST', url: `/api/submissions/${s.id}/ai-suggest/${sug.id}/dismiss`, headers: as('b@x.com'), payload: {} })).json();
    expect(d.ai_suggestion.dismissed_at).not.toBeNull();
    expect(d.priority).toBeNull();
  });

  it('rate-limits to 10 per user per hour', async () => {
    const s = await create('a@x.com');
    for (let i = 0; i < 10; i++) {
      expect((await app.inject({ method: 'POST', url: `/api/submissions/${s.id}/ai-suggest`, headers: as('b@x.com'), payload: {} })).statusCode).toBe(200);
    }
    expect((await app.inject({ method: 'POST', url: `/api/submissions/${s.id}/ai-suggest`, headers: as('b@x.com'), payload: {} })).statusCode).toBe(429);
    expect((await app.inject({ method: 'POST', url: `/api/submissions/${s.id}/ai-suggest`, headers: as('a@x.com'), payload: {} })).statusCode).toBe(200);
  });
});

describe('settings', () => {
  it('validates and persists', async () => {
    expect((await app.inject({ method: 'PATCH', url: '/api/settings', headers: as('a@x.com'), payload: { ai_model: 'nope' } })).statusCode).toBe(400);
    const r = await app.inject({ method: 'PATCH', url: '/api/settings', headers: as('a@x.com'), payload: { ai_model: 'gemini-2.5-pro' } });
    expect(r.json().ai_model).toBe('gemini-2.5-pro');
    expect((await app.inject({ url: '/api/settings', headers: as('b@x.com') })).json().ai_model).toBe('gemini-2.5-pro');
  });
});

describe('wins', () => {
  const finish = async (email: string, over = {}) => {
    const s = await create(email, over);
    await patch(email, s.id, { status: 'done' });
    return s;
  };
  const confirm = (email: string, id: string, payload: object) => app.inject({ method: 'PUT', url: `/api/submissions/${id}/impact`, headers: as(email), payload });
  const wins = async (range = 'all') => (await app.inject({ url: `/api/wins?range=${range}`, headers: as('a@x.com') })).json();

  it('stamps completed_at when a project moves to Done', async () => {
    const s = await create('a@x.com');
    expect((await patch('b@x.com', s.id, { status: 'in_review' })).json().completed_at).toBeNull();
    expect((await patch('b@x.com', s.id, { status: 'done' })).json().completed_at).not.toBeNull();
  });

  it('only confirms impact for Done projects and validates numbers', async () => {
    const open = await create('a@x.com');
    const nums = { people_impacted: 100, hours_saved: 500, cost_reduced: 20000, revenue_increased: 75000 };
    expect((await confirm('b@x.com', open.id, nums)).statusCode).toBe(400);
    const done = await finish('a@x.com');
    const bad = await confirm('b@x.com', done.id, { ...nums, hours_saved: -5, cost_reduced: 1.5 });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().fields.map((f: { field: string }) => f.field).sort()).toEqual(['cost_reduced', 'hours_saved']);
    expect((await confirm('b@x.com', done.id, { ...nums, revenue_increased: undefined })).statusCode).toBe(400);
  });

  it('counts only confirmed wins in totals, lists the rest as pending, and logs activity', async () => {
    const one = await finish('a@x.com', { title: 'Confirmed win one' });
    const two = await finish('a@x.com', { title: 'Confirmed win two' });
    await finish('a@x.com', { title: 'Not yet confirmed' });
    await confirm('b@x.com', one.id, { people_impacted: 100, hours_saved: 500, cost_reduced: 20000, revenue_increased: 75000 });
    const detail = (await confirm('b@x.com', two.id, { people_impacted: 40, hours_saved: 100, cost_reduced: 5000, revenue_increased: 0 })).json();
    expect(detail.impact.confirmed_by.name).toBe('b');
    expect(detail.activity[0].field).toBe('impact');

    const w = await wins();
    expect(w.totals).toEqual({ people_impacted: 140, hours_saved: 600, cost_reduced: 25000, revenue_increased: 75000, count: 2 });
    expect(w.wins).toHaveLength(2);
    expect(w.pending.map((p: { title: string }) => p.title)).toEqual(['Not yet confirmed']);

    // Editing replaces, not adds.
    await confirm('a@x.com', one.id, { people_impacted: 10, hours_saved: 10, cost_reduced: 10, revenue_increased: 10 });
    expect((await wins()).totals.people_impacted).toBe(50);
  });

  it('counts Done projects awaiting confirmation', async () => {
    const count = async () => (await app.inject({ url: '/api/wins/pending-count', headers: as('a@x.com') })).json().count;
    expect(await count()).toBe(0);
    await create('a@x.com'); // not done: not counted
    const one = await finish('a@x.com');
    await finish('a@x.com');
    expect(await count()).toBe(2);
    await confirm('b@x.com', one.id, { people_impacted: 1, hours_saved: 1, cost_reduced: 1, revenue_increased: 1 });
    expect(await count()).toBe(1);
  });

  it('filters by completion date range', async () => {
    const old = await finish('a@x.com');
    await col.submissions.doc(old.id).update({ completed_at: Timestamp.fromMillis(Date.now() - 120 * 86_400_000) });
    const fresh = await finish('a@x.com');
    await confirm('b@x.com', old.id, { people_impacted: 1, hours_saved: 1, cost_reduced: 1, revenue_increased: 1 });
    await confirm('b@x.com', fresh.id, { people_impacted: 1, hours_saved: 1, cost_reduced: 1, revenue_increased: 1 });
    expect((await wins('30d')).totals.count).toBe(1);
    expect((await wins('90d')).totals.count).toBe(1);
    expect((await wins('365d')).totals.count).toBe(2);
    expect((await wins('all')).totals.count).toBe(2);
    expect((await wins('bogus')).range).toBe('90d');
  });

  it('estimates impact only for Done, with one free automatic estimate and a manual rate limit', async () => {
    const open = await create('a@x.com');
    expect((await app.inject({ method: 'POST', url: `/api/submissions/${open.id}/impact-suggest`, headers: as('b@x.com'), payload: {} })).statusCode).toBe(400);

    const done = await finish('a@x.com');
    const suggest = (payload: object = {}) => app.inject({ method: 'POST', url: `/api/submissions/${done.id}/impact-suggest`, headers: as('b@x.com'), payload });
    const first = await suggest({ trigger: 'auto' });
    expect(first.statusCode).toBe(200);
    expect(first.json().people_impacted).toBe(50);
    // A second "auto" claim is treated as manual, so it counts toward the limit: 10 manual allowed, 11th rejected.
    for (let i = 0; i < 10; i++) expect((await suggest({ trigger: 'auto' })).statusCode).toBe(200);
    expect((await suggest({ trigger: 'auto' })).statusCode).toBe(429);

    const detail = (await app.inject({ url: `/api/submissions/${done.id}`, headers: as('a@x.com') })).json();
    expect(detail.impact).toBeNull();
    expect(detail.impact_suggestion).not.toBeNull();
    // Suggestions alone never count.
    expect((await wins()).totals.count).toBe(0);
  });
});
