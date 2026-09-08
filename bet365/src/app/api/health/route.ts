import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const configured = Boolean(process.env.DATABASE_URL);
  if (!configured) {
    return Response.json(
      { ok: false, error: "DATABASE_URL is not set", configured },
      { status: 500 },
    );
  }
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, configured });
  } catch (err) {
    return Response.json(
      { ok: false, error: "database unreachable", detail: String((err as Error)?.message ?? err) },
      { status: 500 },
    );
  }
}
