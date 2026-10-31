"use client";

import { useRouter } from "next/navigation";
import UploadZone from "@/components/upload-zone";
import { ToastStack, useToasts } from "@/components/toast";

export default function HomeUpload() {
  const router = useRouter();
  const { toasts, push, dismiss } = useToasts();

  function handleResult({ ok, failed }: { ok: number; failed: number }) {
    if (ok && failed) push({ type: "info", message: `อัปโหลดสำเร็จ ${ok} ไฟล์ · ล้มเหลว ${failed} ไฟล์` });
    else if (ok) push({ type: "success", message: `อัปโหลดสำเร็จ ${ok} ไฟล์` });
    else if (failed) push({ type: "error", message: `อัปโหลดไม่สำเร็จ ${failed} ไฟล์` });
  }

  return (
    <>
      <UploadZone
        large
        showNote={false}
        onResult={handleResult}
        onUploaded={() => router.refresh()}
      />
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </>
  );
}
