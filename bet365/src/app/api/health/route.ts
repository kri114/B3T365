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
    // Check required tables exist so a fresh/incomplete schema is visible.
    const res = await db.execute(sql`
      select count(*)::int as missing from (values
        ('users'),('sessions'),('bets'),('bet_selections'),('wallet_transactions'),('announcements')
      ) v(t) left join pg_tables p on p.tablename = v.t
      where p.tablename is null
    `);
    const missing = Number((res.rows[0] as { missing: number })?.missing ?? 0);
    return Response.json({ ok: true, configured, missingTables: missing });
  } catch (err) {
    return Response.json(
      { ok: false, configured, error: "db unreachable", detail: String((err as Error)?.message ?? err) },
      { status: 500 },
    );
  }
}
