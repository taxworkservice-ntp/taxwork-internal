import type { Metadata } from "next";
import { loadIntakeByToken, intakeStatus } from "@/lib/intake";
import { getFirmBranding, type FirmBranding } from "@/lib/branding";
import OnboardForm from "./onboard-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ลงทะเบียนลูกค้า",
  robots: { index: false, follow: false },
};

function Notice({
  branding,
  title,
  body,
}: {
  branding: FirmBranding;
  title: string;
  body: string;
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 px-4 py-12 text-center">
      {branding.logoDataUri ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={branding.logoDataUri} alt={branding.firmName} className="h-10 max-w-[60%] object-contain" />
      ) : (
        <div className="text-sm font-bold">{branding.firmName}</div>
      )}
      <div className="card w-full space-y-2 py-8">
        <p className="text-base font-semibold text-neutral-800">{title}</p>
        <p className="text-sm text-neutral-500">{body}</p>
      </div>
    </main>
  );
}

export default async function OnboardPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [found, branding] = await Promise.all([loadIntakeByToken(token), getFirmBranding()]);

  if (!found) {
    return (
      <Notice branding={branding} title="ลิงก์ไม่ถูกต้อง" body="กรุณาตรวจสอบลิงก์ที่ได้รับอีกครั้ง" />
    );
  }
  const status = intakeStatus(found.link);
  if (status === "revoked") {
    return (
      <Notice branding={branding} title="ลิงก์ถูกยกเลิกแล้ว" body="กรุณาติดต่อเจ้าหน้าที่เพื่อขอลิงก์ใหม่" />
    );
  }
  if (status === "expired") {
    return (
      <Notice branding={branding} title="ลิงก์หมดอายุแล้ว" body="กรุณาติดต่อเจ้าหน้าที่เพื่อขอลิงก์ใหม่" />
    );
  }
  const sub = found.submission;
  if (sub) {
    return (
      <Notice
        branding={branding}
        title="คำขอของท่านถูกส่งแล้ว"
        body="กรุณาติดต่อเจ้าหน้าที่หากต้องการแก้ไขข้อมูล ขอบคุณค่ะ"
      />
    );
  }

  return (
    <OnboardForm token={token} branding={branding} initial={null} expiresAt={found.link.expires_at} />
  );
}
