import { addDays } from './util.js';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { db, pool } from '../src/db/index.js';
import { activity, aiSuggestions, settings, submissions, users } from '../src/db/schema.js';
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
  await pool.end();
});
beforeEach(async () => {
  await db.delete(activity);
  await db.delete(aiSuggestions);
  await db.delete(submissions);
  await db.delete(settings);
  await db.delete(users);
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
