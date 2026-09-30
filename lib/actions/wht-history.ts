"use server";

import { sql } from "@/lib/db";
import { requireUser } from "@/lib/session";
import type { WhtFormValues } from "@/lib/wht/fields";

export type WhtHistoryRow = {
  id: string;
  form_type: string;
  certificate_no: string;
  payer_name: string;
  payer_tax_id: string;
  payer_address: string;
  payee_name: string;
  payee_tax_id: string;
  payee_address: string;
  description: string;
  issue_date: string;
  amount: string;
  wht_rate: string;
  signature_text: string;
  file_id: string | null;
  file_name: string | null;
  storage_path: string | null;
  created_at: string;
};

export type WhtHistoryInput = Pick<
  WhtFormValues,
  | "formType"
  | "certificateNo"
  | "payerName"
  | "payerTaxId"
  | "payerAddress"
  | "payeeName"
  | "payeeTaxId"
  | "payeeAddress"
  | "description"
  | "issueDate"
  | "amount"
  | "whtRate"
> & { signatureText: string; fileId: string | null };

/** Latest 15 exports, newest first. File columns are null when the file
 * was deleted from the Files tab — the snapshot stays reusable. */
export async function listWhtHistory(): Promise<WhtHistoryRow[]> {
  await requireUser();
  const rows = (await sql`select h.*, f.file_name, f.storage_path
    from wht_history h left join files f on f.id = h.file_id
    order by h.created_at desc limit 15`) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    form_type: String(r.form_type ?? ""),
    certificate_no: String(r.certificate_no ?? ""),
    payer_name: String(r.payer_name ?? ""),
    payer_tax_id: String(r.payer_tax_id ?? ""),
    payer_address: String(r.payer_address ?? ""),
    payee_name: String(r.payee_name ?? ""),
    payee_tax_id: String(r.payee_tax_id ?? ""),
    payee_address: String(r.payee_address ?? ""),
    description: String(r.description ?? ""),
    issue_date: String(r.issue_date ?? ""),
    amount: String(r.amount ?? ""),
    wht_rate: String(r.wht_rate ?? ""),
    signature_text: String(r.signature_text ?? ""),
    file_id: r.file_id == null ? null : String(r.file_id),
    file_name: r.file_name == null ? null : String(r.file_name),
    storage_path: r.storage_path == null ? null : String(r.storage_path),
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at ?? ""),
  }));
}

export async function saveWhtHistory(input: WhtHistoryInput): Promise<string> {
  await requireUser();
  const rows = (await sql`insert into wht_history
    (form_type, certificate_no, payer_name, payer_tax_id, payer_address,
     payee_name, payee_tax_id, payee_address, description, issue_date,
     amount, wht_rate, signature_text, file_id)
    values (${input.formType}, ${input.certificateNo}, ${input.payerName},
      ${input.payerTaxId}, ${input.payerAddress}, ${input.payeeName},
      ${input.payeeTaxId}, ${input.payeeAddress}, ${input.description},
      ${input.issueDate}, ${input.amount}, ${input.whtRate},
      ${input.signatureText}, ${input.fileId})
    returning id`) as { id: string }[];
  return String(rows[0].id);
}

export async function deleteWhtHistory(id: string): Promise<void> {
  await requireUser();
  await sql`delete from wht_history where id=${id}`;
}
