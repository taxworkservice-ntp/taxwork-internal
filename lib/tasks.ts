"use server";

import { sql } from "@/lib/db";
import { requireUser } from "@/lib/session";

type Template = {
  id: string;
  title: string;
  client_id: string | null;
  frequency: "monthly" | "quarterly" | "annual";
  day_of_period: number;
  months: number[];
};

function periodLabel(d: Date, freq: Template["frequency"]) {
  const y = d.getFullYear();
  if (freq === "annual") return `${y}`;
  if (freq === "quarterly") return `${y}-Q${Math.floor(d.getMonth() / 3) + 1}`;
  return `${y}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function fmtDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Returns how many new task instances were generated for the current period.
export async function generateDueTasks(): Promise<number> {
  await requireUser();
  const templates = (await sql`select * from task_templates where active=true`) as Template[];
  if (!templates.length) return 0;

  const now = new Date();
  let count = 0;

  for (const t of templates) {
    let start: Date | null = null;
    let spanMonths = 1;

    if (t.frequency === "monthly") {
      spanMonths = 1;
      start = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (t.frequency === "quarterly") {
      spanMonths = 3;
      const qm = Math.floor(now.getMonth() / 3) * 3;
      const months: number[] = Array.isArray(t.months) ? t.months.map(Number) : [];
      if (months.includes(qm)) {
        start = new Date(now.getFullYear(), qm, 1);
      }
    } else {
      spanMonths = 12;
      const months: number[] = Array.isArray(t.months) ? t.months.map(Number) : [];
      const m = Math.min(...(months.length ? months : [0]));
      // check windows starting this year and last year
      for (const y of [now.getFullYear() - 1, now.getFullYear()]) {
        const s = new Date(y, m, 1);
        if (now >= s && now < new Date(y, m + 12, 1)) {
          start = s;
          break;
        }
      }
    }
    if (!start) continue;

    const end = new Date(start.getFullYear(), start.getMonth() + spanMonths, 0);
    const due = new Date(
      start.getFullYear(),
      start.getMonth(),
      Math.min(Number(t.day_of_period), end.getDate())
    );
    const label = periodLabel(start, t.frequency);

    await sql`insert into task_instances (template_id, client_id, title, period_label, due_date)
      values (${t.id}, ${t.client_id}, ${t.title}, ${label}, ${fmtDate(due)})
      on conflict (template_id, period_label) do nothing`;
    count++;
  }
  return count;
}
