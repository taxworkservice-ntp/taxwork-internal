import type { Metadata } from "next";
import { cookies } from "next/headers";
import { cache } from "react";
import {
  getShareGateInfo,
  resolveShareToken,
  latestReportFile,
} from "@/lib/actions/reports";
import { buildReportModel } from "@/lib/report-model";
import { periodToThai, formatBaht } from "@/lib/report-format";
import { shareTokenFromSegment } from "@/lib/share-link";
import {
  shareAccessCookieName,
  verifyShareAccess,
} from "@/lib/share-access";
import ShareView from "./share-view";
import ShareGate from "./share-gate";

export const dynamic = "force-dynamic";

/** Per-request memoized load so generateMetadata + the page share one fetch. */
const loadShare = cache(async (token: string) => {
  const resolved = await resolveShareToken(token);
  if (!resolved) return null;
  const model = await buildReportModel(resolved.reportId);
  return { resolved, model };
});

/** True when this browser has already passed the tax-ID gate for the link. */
async function isShareVerified(token: string): Promise<boolean> {
  const key = shareTokenFromSegment(token);
  const value = (await cookies()).get(shareAccessCookieName(key))?.value;
  return verifyShareAccess(value, key);
}

function ExpiredLink() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-lg font-bold">ลิงก์หมดอายุหรือถูกยกเลิก</h1>
      <p className="text-sm text-neutral-500">
        กรุณาติดต่อเจ้าหน้าที่เพื่อขอลิงก์ใหม่
      </p>
    </main>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;

  // Before verification we reveal nothing about the report (title/description
  // are all a link preview or crawler will see).
  if (!(await isShareVerified(token))) {
    const title = "รายงานภาษี";
    const description =
      "ลิงก์รายงานภาษี — กรุณายืนยันตัวตนด้วยเลขประจำตัวผู้เสียภาษีเพื่อเปิดรายงาน";
    return {
      title,
      description,
      twitter: { card: "summary", title, description },
      robots: { index: false, follow: false },
    };
  }

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
      card: "summary",
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

  if (!(await isShareVerified(token))) {
    const info = await getShareGateInfo(token);
    if (!info) return <ExpiredLink />;
    return (
      <ShareGate
        token={token}
        firmName={info.firmName}
        expiresAt={info.expiresAt}
        hasTaxId={info.hasTaxId}
      />
    );
  }

  const loaded = await loadShare(token);
  if (!loaded) return <ExpiredLink />;

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
