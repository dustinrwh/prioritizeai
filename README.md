# Prioritize AI

A dark-mode web app where one company submits Applied AI ideas, triages them on a kanban board, sees what is planned on a Gantt timeline, and gets AI-suggested priorities (Vertex AI / Gemini) that a person accepts or dismisses.

Built from the *Prioritize AI — Product & Technical Spec*. This repo covers milestones 1–4 (app, auth, board, dashboard, AI, settings). The GCP deployment pipeline (milestone 5) is not built yet.

## Stack

React 18 + Vite + Tailwind + TanStack Query + dnd-kit · Fastify + Drizzle ORM + Postgres · Zod schemas shared by client and server (`shared/`).

```
shared/   Zod schemas, enums, DTO types (consumed as TypeScript source)
server/   Fastify API, Drizzle schema + migrations, Vertex AI client, tests
web/      React SPA
```

## Run locally

Requires Node 20, pnpm and Postgres 16 (`docker compose up -d db` or a local install).

```bash
pnpm install
cp .env.example .env        # defaults work for local dev
createdb prioritize_ai      # skip if using docker compose
pnpm db:migrate
pnpm dev                    # Vite on :5173 (proxies /api) + Fastify on :8080
```

Open http://localhost:5173. With `DEV_AUTH=1` the landing page shows a **Dev sign-in** button, so you can use the app without Google credentials. That endpoint does not exist when `NODE_ENV=production`.

### Google sign-in
Create a Web OAuth client in GCP, add `http://localhost:5173` as an authorized JavaScript origin, and set `GOOGLE_CLIENT_ID` in `.env`. The server verifies the ID token and issues its own 7-day HttpOnly session cookie. Any Google account can sign in until the **Allowed sign-in domain** setting is filled in.

### AI suggestions
- `AI_PROVIDER=mock` (default in `.env.example`): a deterministic heuristic, so the flow works offline.
- `AI_PROVIDER=vertex`: real Gemini call. Set `GCP_PROJECT`, run `gcloud auth application-default login`, and make sure the account has `roles/aiplatform.user`. The system prompt can be overridden with `AI_SYSTEM_PROMPT` (Secret Manager in prod). The model comes from the Settings screen.

## Tests

```bash
createdb prioritize_ai_test
pnpm test     # vitest: schema rules + API integration (state rules, permissions, AI flow, rate limit, settings)
pnpm lint     # typecheck all packages
```

## Production build

```bash
pnpm build && NODE_ENV=production pnpm start
```

One Node process serves the API under `/api` and the compiled SPA. In production `SESSION_SECRET` must be 32+ characters.

## Wins
The **Wins** tab reports the impact of completed initiatives as annual estimates: people impacted, hours saved, costs reduced and revenue increased.
- Moving a project to **Done** stamps `completed_at` and (from the browser) asks the AI for an estimate in the background.
- A person opens the project, adjusts the numbers and **confirms**. Only confirmed numbers count toward the totals; Done projects without a confirmation appear under "Awaiting your review".
- Confirming writes an `impact` row to the activity log. The AI estimate uses the model chosen in Settings.
- The automatic estimate is free once per project; manual re-estimates share the 10-per-hour limit.

## Notes / deviations from the spec
- The AI rate limit (10 per user per hour) is counted from the database tables, so it holds across Cloud Run instances.
- Gemini 2.5 spends output tokens on reasoning, so `maxOutputTokens` is 1024 (not the spec's 400) with reasoning off for Flash.
- Settings changes are attributed via `settings.updated_by` / `updated_at` and written to the server log. The `activity` table is per-submission, so it does not hold settings changes.
- Playwright smoke tests and Cloud Deploy files are not included yet. `infra/cloudbuild.yaml` builds and deploys to a single Cloud Run environment.
