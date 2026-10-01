"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { listLoginAccounts, type LoginAccount } from "@/lib/actions/account";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [accounts, setAccounts] = useState<LoginAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listLoginAccounts()
      .then(setAccounts)
      .catch(() => setAccounts([]));
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    setError(null);

    // Password-only: try the password against each account until one
    // matches. Each person's own password selects their account.
    for (const account of accounts) {
      const { error: signInError } = await authClient.signIn.email({
        email: account.email,
        password,
      });
      if (!signInError) {
        router.push("/clients");
        router.refresh();
        return;
      }
    }

    setError("รหัสผ่านไม่ถูกต้อง");
    setLoading(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center">
      <form onSubmit={handleLogin} className="card w-80 space-y-3">
        <h1 className="text-lg font-semibold">Taxwork Internal</h1>
        <div>
          <label className="label" htmlFor="password">
            รหัสผ่าน (ตัวเลข)
          </label>
          <input
            id="password"
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="current-password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value.replace(/[^0-9]/g, ""))}
            disabled={loading}
            required
            autoFocus
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="btn-primary w-full" disabled={loading}>
          {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
        </button>
      </form>
    </main>
  );
}
