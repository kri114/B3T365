import { db } from "@/db";
import { debtRequests, users } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { creditUser, debitUser, BettingError } from "@/lib/betting";
import { and, desc, eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

const MAX_REQUEST_CENTS = 1_000_000_00; // €1,000,000

export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  const [rows, [me]] = await Promise.all([
    db
      .select()
      .from(debtRequests)
      .where(eq(debtRequests.userId, user.id))
      .orderBy(desc(debtRequests.createdAt))
      .limit(50),
    db.select({ debtCents: users.debtCents }).from(users).where(eq(users.id, user.id)).limit(1),
  ]);

  return Response.json({
    requests: rows,
    debtCents: me?.debtCents ?? 0,
    balanceCents: user.balanceCents,
  });
}

/** Create a new credit request, or repay outstanding debt. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const action = body?.action === "repay" ? "repay" : "request";

  try {
    if (action === "repay") {
      const amount = Math.round(Number(body?.amountCents ?? 0));
      if (!Number.isFinite(amount) || amount <= 0)
        return Response.json({ error: "Enter an amount to repay." }, { status: 400 });

      const [me] = await db
        .select({ debtCents: users.debtCents })
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);
      const owed = me?.debtCents ?? 0;
      if (owed <= 0) return Response.json({ error: "You have no outstanding debt." }, { status: 400 });

      const pay = Math.min(amount, owed);
      if (user.balanceCents < pay)
        return Response.json({ error: "Not enough balance to repay that amount." }, { status: 400 });

      await debitUser(user.id, pay, "debt_repayment", "Debt repayment to the house");
      await db
        .update(users)
        .set({ debtCents: sql`greatest(0, ${users.debtCents} - ${pay})` })
        .where(eq(users.id, user.id));

      return Response.json({ ok: true, repaidCents: pay });
    }

    const amount = Math.round(Number(body?.amountCents ?? 0));
    const reason = body?.reason ? String(body.reason).slice(0, 300) : null;
    if (!Number.isFinite(amount) || amount <= 0)
      return Response.json({ error: "Enter how much credit you need." }, { status: 400 });
    if (amount > MAX_REQUEST_CENTS)
      return Response.json({ error: "That amount is too large." }, { status: 400 });

    const pending = await db
      .select({ id: debtRequests.id })
      .from(debtRequests)
      .where(and(eq(debtRequests.userId, user.id), eq(debtRequests.status, "pending")))
      .limit(1);
    if (pending.length > 0)
      return Response.json(
        { error: "You already have a pending request — wait for the house to decide." },
        { status: 409 },
      );

    const [row] = await db
      .insert(debtRequests)
      .values({ userId: user.id, amountCents: amount, reason })
      .returning();

    return Response.json({ request: row });
  } catch (err) {
    if (err instanceof BettingError)
      return Response.json({ error: err.message }, { status: 400 });
    console.error("DEBT_ERROR:", err);
    return Response.json({ error: "Request failed. Try again." }, { status: 500 });
  }
}


