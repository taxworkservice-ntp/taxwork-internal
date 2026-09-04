# Taxwork Internal — Master Prompt

Give this file (plus `MASTER.md`) to any AI assistant before asking it to work on this repo.

## Project

Internal Thai-language web app for Taxwork accounting firm (2 users: owner + mom).
Next.js 15 App Router + TypeScript + Tailwind v4. Deployed on Vercel (`main` branch
auto-deploys to `https://internal.taxworkaccount.com`).

## Stack (current)

- **Database:** Neon Postgres (Singapore). No RLS — authorization is enforced in code.
- **Auth:** better-auth, email + password. Only allowlisted emails (`USER_ALLOWLIST`)
  may register; no sign-up UI. Sessions via cookies; password change at `/password`.
- **Data access:** Server Actions in `lib/actions/` (per domain), each gated by
  `requireUser()`. Route handlers use `requireUserApi()`. `middleware.ts` is a
  fast cookie-presence check only — never the real gate.
- **Raw SQL** via `@neondatabase/serverless` for app tables; `drizzle-orm` is used
  only for the better-auth adapter (`lib/db/auth-schema.ts`).
- **Files:** Cloudflare R2 via presigned URLs (`/api/files/*`). Never Supabase Storage.
- **Env (server-only):** `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
  `USER_ALLOWLIST`, `R2_*`. Nothing database-related may be `NEXT_PUBLIC_`.

## Rules for changes

1. Read `MASTER.md` first — it is the source of truth for schema, flows, and conventions.
2. All UI text in Thai. No new UI component libraries — extend `app/globals.css`.
3. Every new data access path must call `requireUser()` / `requireUserApi()`.
4. New tables: plain Postgres, no RLS; keep `supabase/migrations/` file naming for records.
5. Dates cross the server/client boundary as ISO strings, not `Date` objects.
   Numeric/bigint columns arrive as strings over HTTP — coerce with `num()`.
6. Local dev uses the `neondev` database (safe for test writes). Never write test
   data to the production `neondb`.
7. After changes: `npx tsc --noEmit`, `npx eslint .`, `npm run build`. Commit with a
   concise message and push (auto-deploys).
8. Never commit secrets, `.env.local`, `*.xlsx`, or `import.sql`.
