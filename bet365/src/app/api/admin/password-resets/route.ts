import { db } from "@/db";
import { passwordResetRequests, users } from "@/db/schema";
import { requireAdmin, revokeUserSessions } from "@/lib/auth";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "Forbidden." }, { status: 403 });

  const rows = await db
    .select({
      id: passwordResetRequests.id,
      userId: passwordResetRequests.userId,
      note: passwordResetRequests.note,
      status: passwordResetRequests.status,
      createdAt: passwordResetRequests.createdAt,
      decidedAt: passwordResetRequests.decidedAt,
      username: users.username,
    })
    .from(passwordResetRequests)
    .innerJoin(users, eq(passwordResetRequests.userId, users.id))
    .orderBy(desc(passwordResetRequests.createdAt))
    .limit(60);

  return Response.json({ requests: rows });
}

/**
 * Approve → the password the player chose is applied and all their sessions
 * are revoked. Reject → nothing changes.
 */
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "Forbidden." }, { status: 403 });

  const body = await req.json().catch(() => null);
  const id = String(body?.id ?? "");
  const action = body?.action;
  if (!id || (action !== "approve" && action !== "reject"))
    return Response.json({ error: "id and action (approve|reject) are required." }, { status: 400 });

  const [row] = await db
    .select()
    .from(passwordResetRequests)
    .where(eq(passwordResetRequests.id, id))
    .limit(1);
  if (!row) return Response.json({ error: "Request not found." }, { status: 404 });
  if (row.status !== "pending")
    return Response.json({ error: "Already decided." }, { status: 409 });

  if (action === "approve") {
    await db
      .update(users)
      .set({ passwordHash: row.newPasswordHash })
      .where(eq(users.id, row.userId));
    await revokeUserSessions(row.userId);
  }

  await db
    .update(passwordResetRequests)
    .set({
      status: action === "approve" ? "approved" : "rejected",
      adminId: admin.id,
      decidedAt: new Date(),
    })
    .where(eq(passwordResetRequests.id, id));

  return Response.json({ ok: true });
}
