import { db } from "@/db";
import { debtRequests, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { BettingError, creditUser } from "@/lib/betting";
import { desc, eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "Forbidden." }, { status: 403 });

  const rows = await db
    .select({
      request: debtRequests,
      username: users.username,
      balanceCents: users.balanceCents,
      debtCents: users.debtCents,
    })
    .from(debtRequests)
    .innerJoin(users, eq(debtRequests.userId, users.id))
    .orderBy(desc(debtRequests.createdAt))
    .limit(120);

  return Response.json({ requests: rows });
}

/** Approve (credits the wallet and records the debt) or reject a request. */
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "Forbidden." }, { status: 403 });

  const body = await req.json().catch(() => null);
  const id = String(body?.id ?? "");
  const action = body?.action;
  const note = body?.note ? String(body.note).slice(0, 200) : null;
  const overrideAmount =
    body?.amountCents === undefined || body?.amountCents === null
      ? null
      : Math.round(Number(body.amountCents));

  if (!id || (action !== "approve" && action !== "reject"))
    return Response.json({ error: "id and action (approve|reject) are required." }, { status: 400 });

  const [row] = await db.select().from(debtRequests).where(eq(debtRequests.id, id)).limit(1);
  if (!row) return Response.json({ error: "Request not found." }, { status: 404 });
  if (row.status !== "pending")
    return Response.json({ error: "That request has already been decided." }, { status: 409 });

  try {
    if (action === "approve") {
      const amount =
        overrideAmount !== null && Number.isFinite(overrideAmount) && overrideAmount > 0
          ? overrideAmount
          : row.amountCents;

      await creditUser(
        row.userId,
        amount,
        "debt_credit",
        note ?? "Credit approved by the house",
        admin.id,
      );
      await db
        .update(users)
        .set({ debtCents: sql`${users.debtCents} + ${amount}` })
        .where(eq(users.id, row.userId));
      await db
        .update(debtRequests)
        .set({
          status: "approved",
          adminId: admin.id,
          adminNote: note,
          amountCents: amount,
          decidedAt: new Date(),
        })
        .where(eq(debtRequests.id, id));
      return Response.json({ ok: true, approvedCents: amount });
    }

    await db
      .update(debtRequests)
      .set({ status: "rejected", adminId: admin.id, adminNote: note, decidedAt: new Date() })
      .where(eq(debtRequests.id, id));
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof BettingError)
      return Response.json({ error: err.message }, { status: 400 });
    console.error("ADMIN_DEBT_ERROR:", err);
    return Response.json({ error: "Action failed." }, { status: 500 });
  }
}

/** Manually clear/forgive a user's outstanding debt. */
export async function PATCH(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "Forbidden." }, { status: 403 });
  const body = await req.json().catch(() => null);
  const userId = String(body?.userId ?? "");
  if (!userId) return Response.json({ error: "userId required." }, { status: 400 });
  await db.update(users).set({ debtCents: 0 }).where(eq(users.id, userId));
  return Response.json({ ok: true });
}
