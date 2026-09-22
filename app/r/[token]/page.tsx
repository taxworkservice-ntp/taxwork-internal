import type { Metadata } from "next";
import { resolveShareToken, latestReportFile } from "@/lib/actions/reports";
import { buildReportModel } from "@/lib/report-model";
import ShareView from "./share-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "รายงานภาษี",
  robots: { index: false, follow: false },
};

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const resolved = await resolveShareToken(token);

  if (!resolved) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-2 p-6 text-center">
        <h1 className="text-lg font-bold">ลิงก์หมดอายุหรือถูกยกเลิก</h1>
        <p className="text-sm text-neutral-500">
          กรุณาติดต่อเจ้าหน้าที่เพื่อขอลิงก์ใหม่
        </p>
      </main>
    );
  }

  const [model, file] = await Promise.all([
    buildReportModel(resolved.reportId),
    latestReportFile(resolved.reportId),
  ]);

  return (
    <ShareView
      model={model}
      hasPdf={Boolean(file)}
      token={token}
      expiresAt={resolved.expiresAt}
    />
  );
}
