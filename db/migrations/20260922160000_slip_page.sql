-- Pay-in slips per filing are stored in filing_attachments (kind='slip').
-- pdf_page records which page the slip lands on in the generated PDF so the
-- client-facing share link can say "สลิปการชำระ หน้า X".

alter table filing_attachments
  add column if not exists pdf_page int;
