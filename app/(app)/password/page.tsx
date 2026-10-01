"use client";

import { useState } from "react";
import { changePassword } from "@/lib/actions/account";

export default function PasswordPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setOk(false);
    if (newPassword !== confirm) {
      setMessage("รหัสผ่านใหม่ไม่ตรงกัน");
      return;
    }
    if (newPassword.length < 4) {
      setMessage("รหัสผ่านใหม่ต้องยาวอย่างน้อย 4 ตัวอักษร");
      return;
    }
    setLoading(true);
    try {
      await changePassword(currentPassword, newPassword);
      setOk(true);
      setMessage("เปลี่ยนรหัสผ่านสำเร็จ");
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "เปลี่ยนรหัสผ่านไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-sm">
      <h1 className="mb-4 text-lg font-semibold">เปลี่ยนรหัสผ่าน</h1>
      <form onSubmit={submit} className="card space-y-3">
        <div>
          <label className="label">รหัสผ่านปัจจุบัน</label>
          <input
            type="password"
            className="input"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label">รหัสผ่านใหม่ (อย่างน้อย 4 ตัวอักษร)</label>
          <input
            type="password"
            className="input"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label">ยืนยันรหัสผ่านใหม่</label>
          <input
            type="password"
            className="input"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </div>
        {message && (
          <p className={`text-sm ${ok ? "text-green-600" : "text-red-600"}`}>{message}</p>
        )}
        <button className="btn-primary w-full" disabled={loading}>
          {loading ? "กำลังบันทึก..." : "เปลี่ยนรหัสผ่าน"}
        </button>
      </form>
    </div>
  );
}
