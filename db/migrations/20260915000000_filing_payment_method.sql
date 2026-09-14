-- Free-text payment method per filing (e.g. "สลิป หน้า 2"); overrides auto-derived method on the cover.
alter table monthly_filings
  add column if not exists payment_method text;
