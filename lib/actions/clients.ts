"use server";

import { sql } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { buildUpdate, num } from "./db-helpers";

export type Client = {
  id: string;
  name: string;
  tax_id: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  status: string;
  created_at: string;
};

export type Credential = {
  id: string;
  label: string;
  username: string | null;
  password: string | null;
  portal_url: string | null;
  notes: string | null;
};

export type TaskInstance = {
  id: string;
  title: string;
  period_label: string;
  due_date: string;
  status: string;
};

export type Shareholder = {
  id: string;
  name: string;
  tax_id: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  shares: number | null;
  is_director: boolean;
  notes: string | null;
};

export type ClientForm = { name: string; tax_id: string; email: string; phone: string; address: string };
export type CredentialForm = { label: string; username: string; password: string; portal_url: string; notes: string };
export type ShareholderForm = {
  name: string;
  tax_id: string;
  email: string;
  phone: string;
  address: string;
  shares: string;
  is_director: boolean;
  notes: string;
};

/** Postgres date/timestamptz may arrive as Date over HTTP — UI renders them as strings. */
function str(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  return String(v ?? "");
}

const CLIENT_EDITABLE = ["name", "tax_id", "email", "phone", "address", "notes"];

export async function listClients(): Promise<Client[]> {
  await requireUser();
  const rows = (await sql`select * from clients order by name`) as Client[];
  return rows.map((r) => ({ ...r, created_at: str(r.created_at) }));
}

export async function listCredentials(clientId: string): Promise<Credential[]> {
  await requireUser();
  return (await sql`select id, label, username, password from credentials where client_id=${clientId} order by label`) as Credential[];
}

export async function createClient(form: ClientForm): Promise<void> {
  await requireUser();
  await sql`insert into clients (name, tax_id, email, phone, address)
    values (${form.name}, ${form.tax_id}, ${form.email}, ${form.phone}, ${form.address})`;
}

export async function getClientDetail(id: string): Promise<{
  client: Client | null;
  credentials: Credential[];
  tasks: TaskInstance[];
  shareholders: Shareholder[];
}> {
  await requireUser();
  const [c, creds, t, shs] = await Promise.all([
    sql`select * from clients where id=${id}`,
    sql`select * from credentials where client_id=${id} order by label`,
    sql`select * from task_instances where client_id=${id} order by due_date desc`,
    sql`select * from shareholders where client_id=${id} order by name`,
  ]);
  const client = (c[0] as Client | undefined) ?? null;
  return {
    client: client ? { ...client, created_at: str(client.created_at) } : null,
    credentials: creds as Credential[],
    tasks: (t as TaskInstance[]).map((x) => ({ ...x, due_date: str(x.due_date).slice(0, 10) })),
    shareholders: (shs as Shareholder[]).map((x) => ({ ...x, shares: x.shares == null ? null : num(x.shares) })),
  };
}

export async function updateClient(id: string, edit: Record<string, string | null | undefined>): Promise<void> {
  await requireUser();
  const { text, params } = buildUpdate("clients", id, edit as Record<string, unknown>, CLIENT_EDITABLE);
  await sql.query(text, params);
}

export async function deleteClient(id: string): Promise<void> {
  await requireUser();
  await sql`delete from clients where id=${id}`;
}

export async function addCredential(clientId: string, cred: CredentialForm): Promise<void> {
  await requireUser();
  await sql`insert into credentials (client_id, label, username, password, portal_url, notes)
    values (${clientId}, ${cred.label}, ${cred.username}, ${cred.password}, ${cred.portal_url}, ${cred.notes})`;
}

export async function deleteCredential(cid: string): Promise<void> {
  await requireUser();
  await sql`delete from credentials where id=${cid}`;
}

export async function addShareholder(clientId: string, sh: ShareholderForm): Promise<void> {
  await requireUser();
  const shares = sh.shares === "" ? null : Number(sh.shares);
  const inserted = (await sql`insert into shareholders (client_id, name, tax_id, email, phone, address, shares, is_director, notes)
    values (${clientId}, ${sh.name}, ${sh.tax_id}, ${sh.email}, ${sh.phone}, ${sh.address}, ${shares}, ${sh.is_director}, ${sh.notes})
    returning id, is_director`) as { id: string; is_director: boolean }[];
  if (inserted[0]?.is_director) {
    await sql`update shareholders set is_director=false where client_id=${clientId} and id<>${inserted[0].id}`;
  }
}

export async function deleteShareholder(sid: string): Promise<void> {
  await requireUser();
  await sql`delete from shareholders where id=${sid}`;
}

export async function setDirector(clientId: string, shId: string): Promise<void> {
  await requireUser();
  await sql`update shareholders set is_director=true where id=${shId}`;
  await sql`update shareholders set is_director=false where client_id=${clientId} and id<>${shId}`;
}

export async function toggleTaskStatus(taskId: string, status: string): Promise<void> {
  await requireUser();
  const completedAt = status === "done" ? new Date().toISOString() : null;
  await sql`update task_instances set status=${status}, completed_at=${completedAt} where id=${taskId}`;
}
