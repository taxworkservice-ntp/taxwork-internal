import type { Metadata } from "next";
import { cache } from "react";
import { resolveShareToken, latestReportFile } from "@/lib/actions/reports";
import { buildReportModel } from "@/lib/report-model";
import { periodToThai, formatBaht } from "@/lib/report-format";
import ShareView from "./share-view";

export const dynamic = "force-dynamic";

/** Per-request memoized load so generateMetadata + the page share one fetch. */
const loadShare = cache(async (token: string) => {
  const resolved = await resolveShareToken(token);
  if (!resolved) return null;
  const model = await buildReportModel(resolved.reportId);
  return { resolved, model };
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const loaded = await loadShare(token);

  if (!loaded) {
    return {
      title: "ลิงก์รายงาน",
      robots: { index: false, follow: false },
    };
  }

  const { model } = loaded;
  const title = `รายงานภาษี ${periodToThai(model.periodLabel)}`;
  const description = `${model.client.name} · ยอดรวม ${formatBaht(model.total)} บาท`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      siteName: model.firmName,
      type: "website",
      locale: "th_TH",
      url: model.shareUrl ?? undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    robots: { index: false, follow: false },
  };
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const loaded = await loadShare(token);

  if (!loaded) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-2 p-6 text-center">
        <h1 className="text-lg font-bold">ลิงก์หมดอายุหรือถูกยกเลิก</h1>
        <p className="text-sm text-neutral-500">
          กรุณาติดต่อเจ้าหน้าที่เพื่อขอลิงก์ใหม่
        </p>
      </main>
    );
  }

  const file = await latestReportFile(loaded.resolved.reportId);

  return (
    <ShareView
      model={loaded.model}
      hasPdf={Boolean(file)}
      token={token}
      expiresAt={loaded.resolved.expiresAt}
    />
  );
}
