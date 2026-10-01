# Taxwork Internal — Master Prompt

Give this file (plus `MASTER.md`) to any AI assistant before asking it to work on this repo.

## Project

Internal Thai-language web app for Taxwork accounting firm (2 users: owner + mom).
Next.js 15 App Router + TypeScript + Tailwind v4. Deployed on Vercel (`main` branch
auto-deploys to `https://internal.taxworkaccount.com`).

## Stack (current)

- **Database:** Neon Postgres (Singapore). No RLS — authorization is enforced in code.
- **Auth:** better-auth, email + password. Only allowlisted emails (`USER_ALLOWLIST`)
  may register; no sign-up UI. Sessions via cookies; login is passcode-only
  (no email field — the code is tried against each account). Passcode changes
  are done directly in the database by the owner (no self-service UI).
- **Data access:** Server Actions in `lib/actions/` (per domain), each gated by
  `requireUser()`. Route handlers use `requireUserApi()`. `middleware.ts` is a
  fast cookie-presence check only — never the real gate.
- **Raw SQL** via `@neondatabase/serverless` for app tables; `drizzle-orm` is used
  only for the better-auth adapter (`lib/db/auth-schema.ts`).
- **Files:** Cloudflare R2 via presigned URLs (`/api/files/*`).
- **Region:** Vercel functions pinned to `sin1` (`vercel.json`), next to Neon
  (Singapore) and R2. Never change regions without measuring first.
- **Express Backup:** `/express-backup` module — Neon tables `express_backup_configs`,
  `express_backup_jobs`, `express_backup_agents` (migration in `db/migrations/`);
  Windows Python agent in `agent/` (never bundled with Next.js); agent-only API
  under `/api/express-backup/agent/*` authenticated by Bearer agent credential
  (sha256 hash stored, raw secret shown once — never a better-auth session).
  Full spec in `docs/EXPRESS_BACKUP.md`, agent setup in `agent/README.md`.
- **Env (server-only):** `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
  `USER_ALLOWLIST`, `R2_*`. Nothing database-related may be `NEXT_PUBLIC_`.

## Rules for changes

1. Read `MASTER.md` first — it is the source of truth for schema, flows, and conventions.
2. All UI text in Thai. No new UI component libraries — extend `app/globals.css`.
3. Every new data access path must call `requireUser()` / `requireUserApi()`.
4. New tables: plain Postgres, no RLS; keep `db/migrations/` file naming for records.
5. Client components (`"use client"`) must NEVER import server-only modules
   (`lib/db`, `lib/express-backup`, `lib/auth`, `next/headers`) — not even
   transitively. Top-level `neon()` throws in the browser and crashes the page
   (happened with `/express-backup`). Pure UI constants go in client-safe
   modules (e.g. `lib/express-backup-ui`); data flows via Server Actions.
6. Dates cross the server/client boundary as ISO strings, not `Date` objects.
   Numeric/bigint columns arrive as strings over HTTP — coerce with `num()`.
7. Local dev uses the `neondev` database (safe for test writes). Never write test
   data to the production `neondb`.
8. After changes: `npx tsc --noEmit`, `npx eslint .`, `npm run build`. Commit with a
   concise message and push (auto-deploys).
9. Never commit secrets, `.env.local`, `*.xlsx`, `import.sql`, or `agent/config.json`.
