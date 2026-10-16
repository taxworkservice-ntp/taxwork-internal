# Taxwork Internal — Master Document

> Single source of truth for this project. Give this file to any developer or AI assistant to get full context.

## 1. What this app is

Internal web app for **Taxwork**, a Thai bookkeeping & accounting firm.
Single-user tool (the owner) used daily to:

- Store client company information
- Store e-filing portal credentials per client (username/password per platform)
- Upload/store client files (documents, PDFs)
- Track recurring compliance tasks (monthly VAT, quarterly filings, year-end audits)
- Keep a directory of external auditors/accountants ("contacts") with client assignments
- Small utilities: merge/split PDFs entirely in the browser

**Design philosophy:** lightweight, fast, clean — plain tables, no fancy UI libraries. Optimized for the owner's workflow, not beauty.

## 2. Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 15 (App Router) + TypeScript | Vercel-native |
| Styling | Tailwind CSS v4 + small custom component classes in `app/globals.css` | `.btn`, `.btn-primary`, `.btn-danger`, `.input`, `.label`, `.card`, `.table-base` |
| Database/Auth/Storage | Neon Postgres + better-auth (email/password) + Cloudflare R2 | No RLS — auth enforced in Server Actions / API routes via `requireUser()` |
| PDF tools | pdf-lib (client-side only) | Thai text rendered to canvas (browser shapes it correctly) then embedded as images; Sarabun via `public/fonts/`; files never leave the browser |
| Hosting | Vercel → https://internal.taxworkaccount.com | Auto-deploys on push to `main` |

**Runtime deps kept minimal:** `better-auth`, `drizzle-orm` (auth adapter only), `@neondatabase/serverless`, `pdf-lib`.

## 3. Language & locale

- **All UI text is in Thai** (`<html lang="th">`). Data values can be any language.
- Dates displayed via `toLocaleDateString("th-TH")` where relevant.
- Month names use Thai abbreviations (ม.ค.–ธ.ค.).

## 4. App structure

```
app/
  login/page.tsx              Email+password sign-in (better-auth)
   password/page.tsx           Change password (signed-in users)
  page.tsx                    Redirects to /clients
  (app)/layout.tsx            Shell: desktop sidebar / mobile bottom nav
  (app)/clients/page.tsx      Client list: sortable, copy icons, expandable credential rows
  (app)/clients/[id]/page.tsx Client detail: edit info, credentials CRUD, files, tasks, delete
  (app)/files/page.tsx        All files; upload to general or per-client bucket folder
  (app)/contacts/page.tsx     Auditor/accountant list
  (app)/contacts/[id]/page.tsx Contact detail incl. assigned clients panel
   (app)/tasks/page.tsx        Month navigator, "สร้างงาน" generates instances from templates
   (app)/tasks/templates/page.tsx  Recurring task template manager
   (app)/reports/page.tsx      Monthly report builder: filings per client/month, slip/QR attachments,
                               bank accounts for service fees, generates client-facing PDF (also saved to R2)
   (app)/dashboard/page.tsx    Overdue/upcoming tasks (hidden from nav, still reachable by URL)
   (app)/tools/page.tsx        PDF merge & split (pdf-lib, in-browser)
components/
  sidebar.tsx                 Desktop sidebar + mobile fixed bottom nav + sign-out
  copy-button.tsx             Copy icon w/ check feedback (used on every data field)
  credential-row.tsx          Platform/user/password row (passwords always visible)
  file-section.tsx            Per-client upload/list/delete/download
lib/
  auth.ts                     better-auth server config (drizzle adapter, allowlisted emails)
  auth-client.ts              better-auth React client
  session.ts                  requireUser()/requireUserApi() session gates
  db/index.ts                 Neon client (drizzle for auth, raw SQL for app)
  db/auth-schema.ts           Drizzle schema for better-auth tables
  actions/                    Server Actions per domain (contacts, clients, files, tasks, reports, account)
  tasks.ts                    generateDueTasks() — idempotent task generation (server action)
  report-pdf.ts               Client-side monthly report PDF builder (Sarabun embedded, slips/QR/invoice blocks)
  thai-baht-text.ts           Number → Thai baht words ("...บาทถ้วน")
middleware.ts                Auth guard: no user → /login; logged in on /login → /clients
 db/migrations/              Neon schema record (applied manually, see §10)
```

## 5. Database schema (Neon Postgres)

Postgres schema on Neon (tables defined in `db/migrations/`). better-auth tables (`user`, `session`, `account`, `verification`) were added alongside the app tables. Dev database: `neondev` (same project).

```sql
clients      id, name, tax_id, email, phone, address, notes,
             status ('active'|'archived'), contact_id → contacts.id (nullable),
             created_at

credentials  id, client_id → clients (CASCADE), label (platform name, free text),
             username, password, portal_url, notes, created_at
             -- NOTE: for 'DBD E-filing' and 'สรรพกร E-filing' rows,
             -- username = the client's tax ID (by owner's convention)

files        id, client_id → clients (nullable = general), storage_path,
             file_name, size_bytes, mime_type, category, uploaded_at

contacts     id, name, firm, type ('auditor'|'accountant'|'both'),
             tax_id, license_no (audit ID), phone, email, line_id,
             address, notes, created_at

task_templates id, title, description, client_id (nullable = firm-wide),
             frequency ('monthly'|'quarterly'|'annual'),
             day_of_period (1–31), months int[] (which months apply),
             active bool, created_at

task_instances id, template_id → templates (CASCADE), client_id, title,
             period_label ("2026-08" / "2026-Q3" / "2026"), due_date date,
             status ('todo'|'in_progress'|'done'|'skipped'), completed_at,
             UNIQUE(template_id, period_label)

bank_accounts id, label (e.g. "MyServices"), bank_name, account_no,
              account_name, promptpay_id (nullable), created_at

monthly_filings id, client_id → clients (CASCADE), report_id → monthly_reports (CASCADE, nullable = legacy),
              period_label ("2026-08"),
              form_code (free text w/ presets like ภ.พ.30 / ภ.ง.ด.1),
              description, amount numeric(12,2), due_date date,
              bank_account_id → bank_accounts (nullable = show invoice block in PDF),
              sort_order, created_at

filing_attachments id, filing_id → monthly_filings (CASCADE),
              kind ('slip'|'qr'|'document'), storage_path (R2 under {clientId}/),
              file_name, size_bytes, mime_type, created_at

monthly_reports id, client_id → clients (CASCADE), period_label ("2026-08"),
              seq (round ครั้งที่ N), report_no ("TW-6908-7F3K9Q2M", TW-{YYMM พ.ศ.}-{public_id}),
              public_id (short random key used in report_no + filenames/storage), label,
              status ('draft'|'issued'), issued_at, created_at,
              UNIQUE(client_id, period_label, seq)

files.report_id → monthly_reports (SET NULL; set for monthly-report copies)
```

- **RLS enabled on every table**: all policies are simply `to authenticated using (true)`.
- **File storage: Cloudflare R2** (bucket `internal-waxwork`, S3-compatible). Uploads go browser → presigned PUT (`/api/files/sign-upload`) → straight to R2. Downloads use presigned GETs (`/api/files/sign-download`); deletes via `/api/files/delete`. The monthly-report builder loads attachment bytes server-side via `/api/files/fetch` (authenticated proxy — avoids R2 CORS entirely; R2 omits CORS headers on error responses, which makes presigned-URL fetches undebuggable in the browser). All four API routes require an authenticated better-auth session. Metadata stays in the Neon `files` table.
- **R2 env vars**: `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (set in `.env.local` and Vercel).

## 6. Business rules & UX conventions

- **One client = one contact.** In the contacts detail page, clients already assigned to another contact show greyed out as "ถูกมอบหมายให้ผู้เกี่ยวข้องอื่นแล้ว". Saving assigns newly-checked clients and releases unchecked ones (`clients.contact_id`).
- **Passwords always visible** (owner preference), with copy buttons everywhere. Copy buttons appear on every table field (name, tax ID, etc.) via `<Cell>`/`CopyButton`.
- **Hard-confirm deletes**: deleting a client or contact requires typing its exact name; final button stays disabled until match. Deleting a client cascades credentials/files/tasks.
- **Task generation**: `generateDueTasks()` runs from the Tasks page button. It upserts instances keyed on `(template_id, period_label)` with `ignoreDuplicates` — safe to run repeatedly. Annual templates check windows starting current AND previous year. Due day clamps to last day of period (e.g. day 31 → Feb 28).
- **Task status cycles** on click: รอทำ → กำลังทำ → เสร็จแล้ว → ข้าม.
- **Monthly report flow** (Reports page): pick client + month → choose/create a **round (ครั้งที่ N)** — a client+month can have several (`monthly_reports`, unique per `seq`) → add filing rows (form code, amount, payment method) scoped to the round → attach documents in "ส่วนที่ 2" (ordered, appended after the cover) → optionally link a bank account for service-fee rows → **ดูตัวอย่างปก** previews the actual cover-only PDF in a modal → "ดาวน์โหลด PDF" builds the client-facing PDF entirely in-browser (Sarabun embedded), downloads it, and saves a copy to R2 + `files` (`category: 'monthly-report'`, with `report_id`). Report number is `TW-{YYMM พ.ศ.}-{public_id}` (see `buildReportNo`) — the random `public_id` so clients can't infer volume; the `seq` round is shown separately as ครั้งที่ N. A round can be **issued** (locked, no edits until reopened) or left as draft. Copying from a past month creates a new round here. PDFs are generated with `buildMonthlyReportPdf`; the cover design is switchable (`cover_style` = `modern` | `classic`, or `NEXT_PUBLIC_REPORT_COVER_STYLE`) so the legacy cover remains available.
- **Unsupported image types** (webp/gif) in the report are skipped with a note in the PDF; PNG/JPG and PDF attachments are embedded.
- **Report renderer switch** (`app_settings.report_renderer` = `legacy` | `server`): `server` (default) calls `POST /api/reports/render` → `lib/report-pdf/server` which renders an HTML template through headless Chromium (`@sparticuz/chromium` + `puppeteer-core`) into a PDF with **real, selectable Thai text**, then merges Part 2 documents (`report_documents`) with pdf-lib. `legacy` keeps the original in-browser `buildMonthlyReportPdf` as an opt-out/rollback. Switch at runtime (no redeploy), mirroring `cover_style`. Part 2 documents are persisted to R2 + `report_documents` before a server render. The server cover uses a small letterhead logo (top-left) with subtle brand-colour accents (`brand_color`).
- **Per-filing QR**: each round's filing can carry one QR (`filing_attachments.kind='qr'`), since the form-filling party regenerates it each filing. It takes precedence over the bank account's `qr_path` QR; a new round starts with none.
- **Temporary share link** (LINE delivery): an issued round can mint a token (`monthly_reports.share_token` + `share_expires_at`, 30 days, `generatePublicId(20)`) via the Reports page ("สร้างลิงก์แชร์"). The public, session-less page `/r/[token]` (`middleware.ts` allows `/r/`) shows the payment block (large QR, one-tap copy, best-effort bank-app deep links) and a **รับเอกสาร** block with **ดาวน์โหลด PDF** (`/r/[token]/pdf` → short-lived signed R2 GET of the latest stored copy) and **ส่งไปที่อีเมลของท่านเพื่อจัดเก็บ** (`/r/[token]/email` → emails the round to the client's email on file; tax-ID gated, client-scoped dedupe ~2 min, rate-limited; no address shown). Expired/revoked links show a notice. The active link is also printed (as a clickable anchor) on the server-rendered PDF payment page. The LINE/social link preview is built by the pure `buildSharePreview` (`lib/share-preview.ts`) with a configurable detail level `app_settings.share_preview_detail` (`none|period|client|amount`, default `amount`, set in Reports → settings), plus an editable title/description (`share_preview_title` / `share_preview_description`). Per-token fields come from `loadSharePreviewFields` (no tax-ID gate — the token is the secret). The OG image (`app/r/[token]/opengraph-image.tsx`, edge runtime, Sarabun font) stays clean (firm + period + round; never client/amount). Higher detail levels reveal period/client/amount to anyone holding the link, so LINE caches previews for a while — changes may take a day or two (or a fresh token) to appear.
- **Email delivery** (`report_emails`, Resend): the report is delivered to `clients.email` as an **archival note** — a small body identifying the round (reference block: เลขอ้างอิง / รอบระยะเวลา / ครั้งที่) plus a compact item summary (แบบฟอร์ม · รายละเอียด · จำนวนเงิน) with a รวม total, built by the pure `buildReportEmail` in `lib/email/report-email.ts`, with the round's PDF attached (the canonical stored copy from R2 when present, else a fresh server render). Two triggers: the admin **"ส่งอีเมลรายงาน"** button on the Reports page (`POST /api/reports/email`), and the client-facing **"ส่งไปที่อีเมลของท่านเพื่อจัดเก็บ"** button on the public share page (`POST /r/[token]/email`, tax-ID-gated, recipient fixed to the client's email on file so it can't be a relay, client-scoped dedupe ~2 min so a staff send never blocks the client). Hard-capped at **200 successful sends per calendar month** (`REPORT_EMAIL_MONTHLY_LIMIT`, Thai-time boundary); each attempt is logged to `report_emails` (`sent` counts toward the quota, `failed` does not). Non-reply (no `reply_to`). Resend requires a verified sending domain. Env: `RESEND_API_KEY`, `REPORT_FROM_EMAIL`.
- **Payment reconciliation** (`report_payments`): the Reports page records payments per round (amount, method, note) and shows ยอดที่ต้องชำระ / รับชำระแล้ว / คงเหลือ with a status badge (ยังไม่ชำระ / ชำระบางส่วน / ชำระครบแล้ว). Status logic is the pure `paymentSummary()` in `lib/payments.ts`. The public share page also reflects status (partial remaining or fully-settled message).
- **Sort persistence**: list pages store sort state in `localStorage` (`clients.sort`, `contacts.sort`); Thai-aware `localeCompare(..., "th")`.
- **Tables never overlap**: cells use flex + `min-w-0` + `truncate`; tables wrapped in `overflow-x-auto` with `min-w-[...]` under `table-fixed`.
- **Mobile-first responsive**: fixed bottom tab bar (icons + labels) below `md:`; sidebar only on desktop; forms collapse to 1 column below `sm:`; content padded above/below fixed chrome; sign-out button fixed top-right on mobile.
- **Delete lives on detail pages**, not in list tables (list rows only have "เปิด"/open links).

## 7. Auth flow

- better-auth email/password. Two users (owner + mom), allowlisted via `USER_ALLOWLIST`; public sign-up is rejected server-side and no sign-up UI exists.
- `middleware.ts` checks for the session cookie: unauthenticated → `/login`; authenticated hitting `/login` → `/clients`. Server Actions / API routes re-verify the session via `requireUser()` / `requireUserApi()`.
- Passwords can be changed at `/password` (linked in sidebar). [REMOVED 2026-09-30: passcode-only login; password changes are done directly in the database by the owner.]

## 8. Environment variables

`.env.local` (git-ignored) and Vercel Environment Variables must contain:

```
DATABASE_URL=postgresql://... (Neon pooled connection, server-only — never NEXT_PUBLIC_)
BETTER_AUTH_SECRET=<generated secret>
BETTER_AUTH_URL=https://internal.taxworkaccount.com (http://localhost:3000 for local dev)
USER_ALLOWLIST=<email1>,<email2>
RESEND_API_KEY=<Resend API key> (server-only)
REPORT_FROM_EMAIL=Taxwork Account <reports@taxworkaccount.com> (verified sender)
```

 Login redirects to `/clients` after sign-in. Dashboard/tasks/templates are hidden from nav but still routable.

⚠️ If login breaks on production, check that Vercel env vars (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`) match the current Neon project — a stale `DATABASE_URL` is the most likely cause.

## 9. Deployment

- GitHub: `https://github.com/taxworkservice-ntp/taxwork-internal` (branch `main`)
- Vercel auto-deploys every push to `main`
- Domain: `internal.taxworkaccount.com` (hostatom DNS: CNAME `internal` → `cname.vercel-dns.com.`). Root domain + email (MX/mail A records) intentionally untouched.
- `BETTER_AUTH_URL` must equal the production origin (`https://internal.taxworkaccount.com`).

## 10. Local development

```bash
npm install
npm run dev          # http://localhost:3000
npx tsc --noEmit     # typecheck before committing
npx eslint .         # lint
npm run test         # unit tests (integration test below is skipped by default)
npm run build        # production build check
```

### Server-rendered PDF (headless Chromium)

- Unit tests run with Vitest (`tests/unit`). The integration test (`tests/integration/server-render.test.ts`) renders a real PDF and asserts selectable Thai text; it is **skipped unless** `CHROMIUM_EXECUTABLE_PATH` is set. Locally:
  `CHROMIUM_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npx vitest run tests/integration`.
- On Vercel the bundled `@sparticuz/chromium` binary is used automatically (no env needed); the render route is configured in `vercel.json` (1536 MB / 60s, region `sin1`).
- The `report_renderer` switch stays `legacy` until the server renderer is signed off. Rollback = switch it back in Reports → settings.

Local `.env.local` points at the `neondev` database (safe to write test data there). To apply schema changes, add a migration file under `db/migrations/` and run it against Neon directly (psql or the Neon SQL editor); keep the file as the record.

## 11. Known data facts

- 21 real clients + credentials were imported from `Password งานบัญชี.xlsx` (platforms: DBD E-filing, สรรพกร E-filing, ประกันสังคม, FlowAccount, ZortOut, Shopee, TikTok Shop).
- The xlsx and any generated import SQL are git-ignored (`*.xlsx`, `import.sql`) — never commit them.

## 12. Conventions for future changes

- No new UI component libraries — extend `app/globals.css` classes instead.
- All new user-facing strings in Thai.
- New tables must enable RLS with an `authenticated` policy.
- Keep runtime dependencies minimal; prefer browser-side processing for anything privacy-sensitive.
- After changes: typecheck + lint, then commit with a concise message and push (auto-deploys).
