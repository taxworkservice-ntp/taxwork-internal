import { afterEach, describe, expect, it, vi } from "vitest";
import { adminLineRecipients, buildIntakeLineText } from "@/lib/line";
import { notifyAdminsIntake } from "@/lib/notify-admin";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.ADMIN_LINE_USER_IDS;
  delete process.env.LINE_CHANNEL_ACCESS_TOKEN;
  delete process.env.USER_ALLOWLIST;
  delete process.env.REPORT_FROM_EMAIL;
  vi.restoreAllMocks();
});

describe("buildIntakeLineText", () => {
  it("builds a short 3-line Thai summary", () => {
    const text = buildIntakeLineText({
      company: "บริษัท ตัวอย่าง จำกัด",
      contactName: "สมชาย",
      contactPhone: "0812345678",
      ref: "INT-AB12CD",
      reviewUrl: "https://internal.taxworkaccount.com/onboarding",
    });
    const lines = text.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("บริษัท ตัวอย่าง จำกัด");
    expect(lines[1]).toContain("สมชาย");
    expect(lines[1]).toContain("INT-AB12CD");
    expect(lines[2]).toContain("https://internal.taxworkaccount.com/onboarding");
  });

  it("falls back to a placeholder company name", () => {
    expect(buildIntakeLineText({ company: "  ", contactName: "a", contactPhone: "b", ref: "r", reviewUrl: "u" })).toContain(
      "(ไม่ระบุชื่อ)"
    );
  });
});

describe("adminLineRecipients", () => {
  it("parses comma-separated ids", () => {
    process.env.ADMIN_LINE_USER_IDS = "Uaaa, Ubbb ,";
    expect(adminLineRecipients()).toEqual(["Uaaa", "Ubbb"]);
    delete process.env.ADMIN_LINE_USER_IDS;
  });

  it("returns empty when unset", () => {
    delete process.env.ADMIN_LINE_USER_IDS;
    expect(adminLineRecipients()).toEqual([]);
  });
});

describe("notifyAdminsIntake", () => {
  it("sends LINE only to env recipients — client data can never become a recipient", async () => {
    process.env.ADMIN_LINE_USER_IDS = "Uadmin111";
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "test-token";
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    globalThis.fetch = (async (url: unknown, init?: { body?: unknown }) => {
      calls.push({ url: String(url), body: JSON.parse(String((init?.body as string) ?? "{}")) });
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    const res = await notifyAdminsIntake({
      company: "บริษัท ตัวอย่าง จำกัด",
      contactName: "สมชาย",
      // Looks like a user ID but must never be used as a recipient.
      contactPhone: "U999attacker",
      contactEmail: "a@b.com",
      ref: "INT-AB12CD",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("api.line.me");
    // The recipient field is the env allowlist value — never client input,
    // even when a client field looks like a user ID.
    const sent = calls[0].body as { to: string };
    expect(sent.to).toBe("Uadmin111");
    expect(sent.to).not.toBe("U999attacker");
    expect(res.email).toBe("skipped");
    expect(res.line).toEqual([{ to: "Uadmin111", ok: true }]);
  });

  it("does nothing and never throws when no recipients are configured", async () => {
    let fetched = false;
    globalThis.fetch = (async () => {
      fetched = true;
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    const res = await notifyAdminsIntake({
      company: "x",
      contactName: "y",
      contactPhone: "z",
      contactEmail: "w",
      ref: "r",
    });

    expect(fetched).toBe(false);
    expect(res).toEqual({ email: "skipped", line: [] });
  });
});
