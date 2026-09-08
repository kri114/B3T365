import { db } from "@/db";
import { users } from "@/db/schema";
import { releaseAdminLock } from "@/lib/auth";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Emergency release for the admin single-device lock.
 *
 * The admin account is locked to one device until it signs out — with NO idle
 * timeout. If that session is ever lost (cookies cleared, browser profile
 * wiped, device replaced), this is the only way back in.
 *
 *   POST /api/admin/unlock
 *   { "key": "<value of ADMIN_UNLOCK_KEY env var>" }
 *
 * Requires ADMIN_UNLOCK_KEY to be set on the server; if it isn't, the request
 * is refused so the lock can never be bypassed by guessing.
 */
export async function POST(req: Request) {
  const expected = process.env.ADMIN_UNLOCK_KEY?.trim();
  if (!expected) {
    return Response.json(
      {
        error:
          "Emergency unlock is disabled. Set ADMIN_UNLOCK_KEY in the environment (e.g. on Render) to enable it.",
      },
      { status: 501 },
    );
  }

  const body = await req.json().catch(() => null);
  const supplied = String(body?.key ?? "");
  if (supplied !== expected) {
    return Response.json({ error: "Invalid unlock key." }, { status: 401 });
  }

  const username = process.env.ADMIN_USERNAME?.trim() || "KriAdmin";
  const [admin] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.username}) = lower(${username})`)
    .limit(1);

  if (!admin) return Response.json({ error: "Admin account not found." }, { status: 404 });

  await releaseAdminLock(admin.id);
  return Response.json({ ok: true, message: "Admin lock released — you can sign in again." });
}
