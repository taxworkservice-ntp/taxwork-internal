-- Second bank logo for the payment-method cell: "บน" (top line, bank name)
-- uses the existing logo_path; this adds "ล่าง" (bottom line, account number).
alter table bank_accounts
  add column if not exists logo_bottom_path text,
  add column if not exists logo_bottom_mime_type text;
