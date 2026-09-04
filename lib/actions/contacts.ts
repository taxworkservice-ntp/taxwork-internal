"use server";

import { sql } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { buildUpdate } from "./db-helpers";

export type Contact = {
  id: string;
  name: string;
  firm: string | null;
  type: "auditor" | "accountant" | "both";
  tax_id: string | null;
  license_no: string | null;
  phone: string | null;
  email: string | null;
  line_id: string | null;
  address: string | null;
  notes: string | null;
};

export type ContactForm = {
  name: string;
  firm: string;
  type: Contact["type"];
  tax_id: string;
  license_no: string;
  phone: string;
  email: string;
  line_id: string;
  address: string;
  notes: string;
};

export type ClientRef = { id: string; name: string; contact_id: string | null };

const EDITABLE = [
  "name",
  "firm",
  "type",
  "tax_id",
  "license_no",
  "phone",
  "email",
  "line_id",
  "address",
  "notes",
];

export async function listContacts(): Promise<Contact[]> {
  await requireUser();
  return (await sql`select * from contacts`) as Contact[];
}

export async function createContact(form: ContactForm): Promise<void> {
  await requireUser();
  await sql`insert into contacts (name, firm, type, tax_id, license_no, phone, email, line_id, address, notes)
    values (${form.name}, ${form.firm}, ${form.type}, ${form.tax_id}, ${form.license_no}, ${form.phone}, ${form.email}, ${form.line_id}, ${form.address}, ${form.notes})`;
}

export async function getContact(id: string): Promise<{ contact: Contact | null; clients: ClientRef[] }> {
  await requireUser();
  const [c, cl] = await Promise.all([
    sql`select * from contacts where id=${id}`,
    sql`select id, name, contact_id from clients order by name`,
  ]);
  return { contact: (c[0] as Contact) ?? null, clients: cl as ClientRef[] };
}

export async function updateContact(
  id: string,
  edit: Record<string, string | null | undefined>,
  toAssign: string[],
  toRelease: string[]
): Promise<void> {
  await requireUser();
  const { text, params } = buildUpdate("contacts", id, edit as Record<string, unknown>, EDITABLE);
  await sql.query(text, params);
  if (toAssign.length) {
    const ph = toAssign.map((_, i) => `$${i + 1}`).join(",");
    await sql.query(`update clients set contact_id=$1 where id in (${ph})`, [id, ...toAssign]);
  }
  if (toRelease.length) {
    const ph = toRelease.map((_, i) => `$${i + 1}`).join(",");
    await sql.query(`update clients set contact_id=null where id in (${ph})`, toRelease);
  }
}

export async function deleteContact(id: string): Promise<void> {
  await requireUser();
  await sql`delete from contacts where id=${id}`;
}
