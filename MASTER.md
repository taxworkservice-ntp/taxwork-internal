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
| Database/Auth/Storage | Supabase (Postgres + Auth + Storage) | Project ref: `bcftfhhnrmsblgbvmjnd` |
| PDF tools | pdf-lib + @pdf-lib/fontkit (client-side only) | Thai text via embedded Sarabun fonts (`public/fonts/`); files never leave the browser |
| Hosting | Vercel → https://internal.taxworkaccount.com | Auto-deploys on push to `main` |

**Runtime deps kept minimal:** `@supabase/ssr`, `@supabase/supabase-js`, `pdf-lib`, `@pdf-lib/fontkit`.

## 3. Language & locale

- **All UI text is in Thai** (`<html lang="th">`). Data values can be any language.
- Dates displayed via `toLocaleDateString("th-TH")` where relevant.
- Month names use Thai abbreviations (ม.ค.–ธ.ค.).

## 4. App structure

```
app/
  login/page.tsx              Email+password sign-in (Supabase Auth)
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
  supabase/client.ts          Browser Supabase client (@supabase/ssr)
  supabase/server.ts          Server Supabase client
  tasks.ts                    generateDueTasks() — idempotent task generation
  report-pdf.ts               Client-side monthly report PDF builder (Sarabun embedded, slips/QR/invoice blocks)
  thai-baht-text.ts           Number → Thai baht words ("...บาทถ้วน")
middleware.ts                Auth guard: no user → /login; logged in on /login → /clients
supabase/migrations/         Schema applied to production via Management API
```

## 5. Database schema (Supabase)

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

monthly_filings id, client_id → clients (CASCADE), period_label ("2026-08"),
              form_code (free text w/ presets like ภ.พ.30 / ภ.ง.ด.1),
              description, amount numeric(12,2), due_date date,
              bank_account_id → bank_accounts (nullable = show invoice block in PDF),
              sort_order, created_at

filing_attachments id, filing_id → monthly_filings (CASCADE),
              kind ('slip'|'qr'|'document'), storage_path (R2 under {clientId}/),
              file_name, size_bytes, mime_type, created_at
```

- **RLS enabled on every table**: all policies are simply `to authenticated using (true)`.
- **File storage: Cloudflare R2** (bucket `internal-waxwork`, S3-compatible). Uploads go browser → presigned PUT (`/api/files/sign-upload`) → straight to R2. Downloads use presigned GETs (`/api/files/sign-download`); deletes via `/api/files/delete`. All three API routes require an authenticated Supabase session. Metadata stays in the Supabase `files` table. Legacy Supabase Storage bucket `client-files` still exists but is no longer used.
- **R2 env vars**: `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (set in `.env.local` and Vercel).

## 6. Business rules & UX conventions

- **One client = one contact.** In the contacts detail page, clients already assigned to another contact show greyed out as "ถูกมอบหมายให้ผู้เกี่ยวข้องอื่นแล้ว". Saving assigns newly-checked clients and releases unchecked ones (`clients.contact_id`).
- **Passwords always visible** (owner preference), with copy buttons everywhere. Copy buttons appear on every table field (name, tax ID, etc.) via `<Cell>`/`CopyButton`.
- **Hard-confirm deletes**: deleting a client or contact requires typing its exact name; final button stays disabled until match. Deleting a client cascades credentials/files/tasks.
- **Task generation**: `generateDueTasks()` runs from the Tasks page button. It upserts instances keyed on `(template_id, period_label)` with `ignoreDuplicates` — safe to run repeatedly. Annual templates check windows starting current AND previous year. Due day clamps to last day of period (e.g. day 31 → Feb 28).
- **Task status cycles** on click: รอทำ → กำลังทำ → เสร็จแล้ว → ข้าม.
- **Monthly report flow** (Reports page): pick client + month → add filing rows (form code, amount, due date) → attach slip/QR/document images or PDFs per row (uploaded to R2 via the same presign flow, stored in `filing_attachments`) → optionally link a bank account for service-fee rows (renders an invoice-style block) → "สร้างรายงาน PDF" builds the client-facing PDF entirely in-browser (Sarabun embedded), downloads it, and saves a copy to R2 + `files` table with `category: 'monthly-report'`. Unsupported image types (webp/gif) are skipped with a note in the PDF; PNG/JPG and PDF attachments are embedded.
- **Sort persistence**: list pages store sort state in `localStorage` (`clients.sort`, `contacts.sort`); Thai-aware `localeCompare(..., "th")`.
- **Tables never overlap**: cells use flex + `min-w-0` + `truncate`; tables wrapped in `overflow-x-auto` with `min-w-[...]` under `table-fixed`.
- **Mobile-first responsive**: fixed bottom tab bar (icons + labels) below `md:`; sidebar only on desktop; forms collapse to 1 column below `sm:`; content padded above/below fixed chrome; sign-out button fixed top-right on mobile.
- **Delete lives on detail pages**, not in list tables (list rows only have "เปิด"/open links).

## 7. Auth flow

- Supabase email/password. Single user created manually in Supabase dashboard (Auto Confirm).
- `middleware.ts` protects every route: unauthenticated → `/login`; authenticated hitting `/login` → `/clients`.
- Login redirects to `/clients` (the landing page). Dashboard/tasks/templates are hidden from nav but still routable.

## 8. Environment variables

`.env.local` (git-ignored) and Vercel Environment Variables must contain:

```
NEXT_PUBLIC_SUPABASE_URL=https://bcftfhhnrmsblgbvmjnd.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

⚠️ The production domain once pointed at the wrong Supabase project (`fbhoqcpqqtbiorzbuqcl`) causing "Invalid login credentials". If login breaks on production, verify which project URL is embedded in the deployed JS chunks first.

## 9. Deployment

- GitHub: `https://github.com/taxworkservice-ntp/taxwork-internal` (branch `main`)
- Vercel auto-deploys every push to `main`
- Domain: `internal.taxworkaccount.com` (hostatom DNS: CNAME `internal` → `cname.vercel-dns.com.`). Root domain + email (MX/mail A records) intentionally untouched.
- Supabase Auth URL Configuration: Site URL + Redirect URLs include `https://internal.taxworkaccount.com`

## 10. Local development

```bash
npm install
npm run dev          # http://localhost:3000
npx tsc --noEmit     # typecheck before committing
npx eslint .         # lint
npm run build        # production build check
```

Supabase CLI is installed locally and linked (project `bcftfhhnrmsblgbvmjnd`). Migrations in `supabase/migrations/` were pushed via the Management API (`POST /v1/projects/{ref}/database/query`) because `db push` needed Docker. To apply future schema changes, either add a migration file and push the same way, or run SQL in the dashboard editor.

## 11. Known data facts

- 21 real clients + credentials were imported from `Password งานบัญชี.xlsx` (platforms: DBD E-filing, สรรพกร E-filing, ประกันสังคม, FlowAccount, ZortOut, Shopee, TikTok Shop).
- The xlsx and any generated import SQL are git-ignored (`*.xlsx`, `import.sql`) — never commit them.

## 12. Conventions for future changes

- No new UI component libraries — extend `app/globals.css` classes instead.
- All new user-facing strings in Thai.
- New tables must enable RLS with an `authenticated` policy.
- Keep runtime dependencies minimal; prefer browser-side processing for anything privacy-sensitive.
- After changes: typecheck + lint, then commit with a concise message and push (auto-deploys).
