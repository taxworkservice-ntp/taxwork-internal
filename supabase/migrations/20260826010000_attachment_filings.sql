-- One payment evidence (slip/qr) can cover several filings (e.g. one transfer paying ภ.ง.ด.3 + ภ.ง.ด.53).
-- filing_attachments.filing_id remains the owning filing; this table adds extra covered filings.

create table attachment_filings (
  attachment_id uuid not null references filing_attachments(id) on delete cascade,
  filing_id uuid not null references monthly_filings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (attachment_id, filing_id)
);

create index attachment_filings_filing_idx on attachment_filings (filing_id);

alter table attachment_filings enable row level security;

create policy "authenticated all attachment_filings" on attachment_filings
  for all to authenticated using (true) with check (true);
