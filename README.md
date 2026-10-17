# Prioritize AI

A dark-mode web app where one company submits Applied AI ideas, triages them on a kanban board, sees what is planned on a Gantt timeline, and gets AI-suggested priorities (Vertex AI / Gemini) that a person accepts or dismisses.

Built from the *Prioritize AI — Product & Technical Spec*. This repo covers milestones 1–4 (app, auth, board, dashboard, AI, settings). The GCP deployment pipeline (milestone 5) is not built yet.

## Stack

React 18 + Vite + Tailwind + TanStack Query + dnd-kit · Fastify + Firestore · Zod schemas shared by client and server (`shared/`).

```
shared/   Zod schemas, enums, DTO types (consumed as TypeScript source)
server/   Fastify API, Firestore data layer, Vertex AI client, tests
web/      React SPA
```

## Run locally

Requires Node 20, pnpm, the gcloud CLI with the Firestore emulator (`gcloud components install cloud-firestore-emulator`) and Java 21+ (`brew install openjdk@21`).

```bash
pnpm install
cp .env.example .env        # defaults work for local dev
pnpm emulator               # terminal 1: local Firestore on :8181 (data is wiped when it stops)
pnpm seed                   # optional: load 5 sample ideas into the emulator
pnpm dev                    # terminal 2: Vite on :5173 (proxies /api) + Fastify on :8080
```

Open http://localhost:5173. With `DEV_AUTH=1` the landing page shows a **Dev sign-in** button, so you can use the app without Google credentials. That endpoint does not exist when `NODE_ENV=production`. `pnpm seed` refuses to run unless it is pointed at the emulator.

### Google sign-in
Create a Web OAuth client in GCP, add `http://localhost:5173` as an authorized JavaScript origin, and set `GOOGLE_CLIENT_ID` in `.env`. The server verifies the ID token and issues its own 7-day HttpOnly session cookie. Any Google account can sign in until the **Allowed sign-in domain** setting is filled in.

### AI suggestions
- `AI_PROVIDER=mock` (default in `.env.example`): a deterministic heuristic, so the flow works offline.
- `AI_PROVIDER=vertex`: real Gemini call. Set `GCP_PROJECT`, run `gcloud auth application-default login`, and make sure the account has `roles/aiplatform.user`. The system prompt can be overridden with `AI_SYSTEM_PROMPT` (Secret Manager in prod). The model comes from the Settings screen.

## Tests

```bash
pnpm test     # vitest: schema rules + API integration against a throwaway Firestore emulator (needs gcloud + Java 21)
pnpm lint     # typecheck all packages
```

## Production build

```bash
pnpm build && NODE_ENV=production pnpm start
```

One Node process serves the API under `/api` and the compiled SPA. In production `SESSION_SECRET` must be 32+ characters.

## Data (Firestore)
Collections: `users`, `submissions` (with an `activity` subcollection and the confirmed `impact` embedded), `ai_suggestions`, `impact_suggestions`, and `settings/app`. Business rules (planned needs dates, enums, limits) are enforced by the API with Zod rather than by the database. Queries that need composite indexes are created by `infra/create-firestore-indexes.sh PROJECT_ID`. Firestore's free tier covers this app's traffic, and there is no database instance to run, patch or pay for while idle.

## Wins
The **Wins** tab reports the impact of completed initiatives as annual estimates: people impacted, hours saved, costs reduced and revenue increased.
- Moving a project to **Done** stamps `completed_at` and (from the browser) asks the AI for an estimate in the background.
- A person opens the project, adjusts the numbers and **confirms**. Only confirmed numbers count toward the totals; Done projects without a confirmation appear under "Awaiting your review".
- Confirming writes an `impact` row to the activity log. The AI estimate uses the model chosen in Settings.
- The automatic estimate is free once per project; manual re-estimates share the 10-per-hour limit.

## Notes / deviations from the spec
- The AI rate limit (10 per user per hour) is counted from Firestore, so it holds across Cloud Run instances.
- The spec called for Cloud SQL (Postgres); this app uses Firestore instead to avoid a fixed monthly cost for a low-traffic tool.
- Gemini 2.5 spends output tokens on reasoning, so `maxOutputTokens` is 1024 (not the spec's 400) with reasoning off for Flash.
- Settings changes are attributed via `settings.updated_by` / `updated_at` and written to the server log. The `activity` table is per-submission, so it does not hold settings changes.
- Playwright smoke tests and Cloud Deploy files are not included yet. `infra/cloudbuild.yaml` builds and deploys to a single Cloud Run environment (no database migration step).
