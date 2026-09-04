// Server-only Neon client: drizzle (for better-auth adapter) + raw `sql`
// (for app queries). Never import from client components.
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./auth-schema";

export const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });
