"use server";

import { sql } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { num } from "./db-helpers";

export type Task = {
  id: string;
  title: string;
  period_label: string;
  due_date: string;
  status: string;
  client_id: string | null;
  clients: { name: string } | null;
};

export type Template = {
  id: string;
  title: string;
  description: string | null;
  client_id: string | null;
  frequency: "monthly" | "quarterly" | "annual";
  day_of_period: number;
  months: number[];
  active: boolean;
  clients: { name: string } | null;
};

export type TemplateForm = {
  title: string;
  description: string;
  client_id: string;
  frequency: Template["frequency"];
  day_of_period: number;
  months: number[];
  active: boolean;
};

function toTask(r: Record<string, unknown>): Task {
  const { client_name, ...rest } = r as Record<string, unknown> & { client_name: string | null };
  const t = rest as unknown as Task;
  const due = t.due_date as unknown;
  return {
    ...t,
    due_date: (due instanceof Date ? due.toISOString() : String(due ?? "")).slice(0, 10),
    clients: client_name ? { name: client_name } : null,
  };
}

function toTemplate(r: Record<string, unknown>): Template {
  const { client_name, ...rest } = r as Record<string, unknown> & { client_name: string | null };
  const t = rest as unknown as Template;
  return {
    ...t,
    day_of_period: num(t.day_of_period),
    months: Array.isArray(t.months) ? (t.months as unknown[]).map((m) => num(m)) : [],
    clients: client_name ? { name: client_name } : null,
  };
}

const pgIntArray = (arr: number[]) => `{${arr.join(",")}}`;

export async function listMonthTasks(first: string, last: string): Promise<Task[]> {
  await requireUser();
  const rows = await sql`select ti.*, c.name as client_name from task_instances ti
    left join clients c on c.id = ti.client_id
    where ti.due_date >= ${first} and ti.due_date <= ${last} order by ti.due_date`;
  return rows.map(toTask);
}

export async function cycleTaskStatus(taskId: string, next: string): Promise<void> {
  await requireUser();
  const completedAt = next === "done" ? new Date().toISOString() : null;
  await sql`update task_instances set status=${next}, completed_at=${completedAt} where id=${taskId}`;
}

export async function listTemplates(): Promise<Template[]> {
  await requireUser();
  const rows = await sql`select tt.*, c.name as client_name from task_templates tt
    left join clients c on c.id = tt.client_id order by tt.title`;
  return rows.map(toTemplate);
}

export async function listClientOptions(): Promise<{ id: string; name: string }[]> {
  await requireUser();
  return (await sql`select id, name from clients order by name`) as { id: string; name: string }[];
}

export async function createTemplate(form: TemplateForm): Promise<void> {
  await requireUser();
  await sql`insert into task_templates (title, description, client_id, frequency, day_of_period, months, active)
    values (${form.title}, ${form.description || null}, ${form.client_id || null}, ${form.frequency}, ${form.day_of_period}, ${pgIntArray(form.months)}, ${form.active})`;
}

export async function toggleTemplateActive(id: string, active: boolean): Promise<void> {
  await requireUser();
  await sql`update task_templates set active=${active} where id=${id}`;
}

export async function deleteTemplate(id: string): Promise<void> {
  await requireUser();
  await sql`delete from task_templates where id=${id}`;
}

export async function getDashboard(): Promise<{
  overdue: Task[];
  upcoming: Task[];
  activeClients: number;
}> {
  await requireUser();
  const today = new Date().toISOString().slice(0, 10);
  const in14 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const [o, u, c] = await Promise.all([
    sql`select ti.*, c.name as client_name from task_instances ti
      left join clients c on c.id = ti.client_id
      where ti.status in ('todo','in_progress') and ti.due_date < ${today} order by ti.due_date`,
    sql`select ti.*, c.name as client_name from task_instances ti
      left join clients c on c.id = ti.client_id
      where ti.status in ('todo','in_progress') and ti.due_date >= ${today} and ti.due_date <= ${in14} order by ti.due_date`,
    sql`select count(*)::int as n from clients where status='active'`,
  ]);
  return { overdue: o.map(toTask), upcoming: u.map(toTask), activeClients: (c[0] as { n: number }).n };
}
