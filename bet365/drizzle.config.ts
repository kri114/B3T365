import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config();

const url =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:5432/app_db";

// Same SSL policy as the app + boot script: plain TCP for localhost and bare
// internal hostnames, relaxed TLS for public managed hosts.
function sslFor(u: string) {
  if (/[?&]sslmode=/.test(u)) return undefined;
  if (/localhost|127\.0\.0\.1/.test(u)) return undefined;
  const host = u.split("@").pop()?.split("/")[0]?.split(":")[0] ?? "";
  if (host && !host.includes(".")) return undefined;
  return { rejectUnauthorized: false } as const;
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: {
    url,
    ssl: sslFor(url),
  },
});
