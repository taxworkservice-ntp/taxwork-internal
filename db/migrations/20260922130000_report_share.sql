-- Temporary share links for a report round: a long random token + expiry so a
-- client can open a mobile page (via LINE) to pay and download the PDF.
-- Tokens are separate from public_id (which is short and printed in report_no).

alter table monthly_reports
  add column if not exists share_token text,
  add column if not exists share_expires_at timestamptz,
  add column if not exists share_revoked_at timestamptz;

create unique index if not exists monthly_reports_share_token_idx
  on monthly_reports (share_token)
  where share_token is not null;
