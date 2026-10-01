import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { db } from "./db";
import * as schema from "./db/auth-schema";

// Internal 2-user app: only allowlisted emails may exist.
// Sign-up UI is never exposed; this hook is defense-in-depth.
const ALLOWLIST = (process.env.USER_ALLOWLIST ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: { enabled: true, minPasswordLength: 4 },
  // Production domain + local dev + Vercel previews (branch deployments).
  // Preview wildcard is acceptable for this 2-user internal app; the
  // allowlist hook below remains the real gate for account creation.
  trustedOrigins: [
    "http://localhost:3000",
    "http://localhost:3001",
    "https://internal.taxworkaccount.com",
    "https://*.vercel.app",
  ],
  databaseHooks: {
    user: {
      create: {
        async before(user) {
          if (ALLOWLIST.length > 0 && !ALLOWLIST.includes(user.email.toLowerCase())) {
            throw new APIError(403, { message: "Registration is invite-only." });
          }
        },
      },
    },
  },
});
