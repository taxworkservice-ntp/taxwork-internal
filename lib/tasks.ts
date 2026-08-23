import { createClient } from "@/lib/supabase/client";

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
  const supabase = createClient();
  const { data: templates } = await supabase
    .from("task_templates")
    .select("*")
    .eq("active", true);
  if (!templates?.length) return 0;

  const now = new Date();
  let count = 0;

  for (const t of templates as Template[]) {
    let start: Date | null = null;
    let spanMonths = 1;

    if (t.frequency === "monthly") {
      spanMonths = 1;
      start = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (t.frequency === "quarterly") {
      spanMonths = 3;
      const qm = Math.floor(now.getMonth() / 3) * 3;
      if (t.months.includes(qm)) {
        start = new Date(now.getFullYear(), qm, 1);
      }
    } else {
      spanMonths = 12;
      const m = Math.min(...(t.months.length ? t.months : [0]));
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
      Math.min(t.day_of_period, end.getDate())
    );
    const label = periodLabel(start, t.frequency);

    const { error } = await supabase.from("task_instances").upsert(
      {
        template_id: t.id,
        client_id: t.client_id,
        title: t.title,
        period_label: label,
        due_date: fmtDate(due),
      },
      { onConflict: "template_id,period_label", ignoreDuplicates: true }
    );
    if (!error) count++;
  }
  return count;
}
