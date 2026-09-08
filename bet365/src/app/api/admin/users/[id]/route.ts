import { db } from "@/db";
import { users } from "@/db/schema";
import { requireAdmin, revokeUserSessions } from "@/lib/auth";
import { BettingError, creditUser, debitUser } from "@/lib/betting";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

type Action = "credit" | "debit" | "ban" | "unban";

/**
 * POST /api/admin/users/{id}
 * The house controls every wallet: credit/debit virtual euros and ban/unban.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "Forbidden." }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const action = String(body?.action ?? "") as Action;
  const note = body?.note ? String(body.note).slice(0, 200) : null;

  const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!target) return Response.json({ error: "User not found." }, { status: 404 });

  try {
    switch (action) {
      case "credit":
      case "debit": {
        const amount = Math.round(Number(body?.amountCents ?? 0));
        if (!Number.isFinite(amount) || amount <= 0)
          return Response.json({ error: "Amount must be a positive number of cents." }, { status: 400 });
        if (amount > 100_000_000_00)
          return Response.json({ error: "Amount too large." }, { status: 400 });
        const kind = action === "credit" ? "admin_credit" : "admin_debit";
        const label = note ?? (action === "credit" ? "Admin deposit" : "Admin deduction");
        const balance =
          action === "credit"
            ? await creditUser(id, amount, kind, label, admin.id)
            : await debitUser(id, amount, kind, label, admin.id);
        return Response.json({ ok: true, balanceCents: balance });
      }
      case "ban": {
        if (target.id === admin.id)
          return Response.json({ error: "You cannot ban the admin account." }, { status: 400 });
        if (target.isAdmin)
          return Response.json({ error: "Admin accounts cannot be banned." }, { status: 400 });
        await db
          .update(users)
          .set({ isBanned: true, banReason: note ?? "Banned by admin" })
          .where(eq(users.id, id));
        await revokeUserSessions(id);
        return Response.json({ ok: true });
      }
      case "unban": {
        await db
          .update(users)
          .set({ isBanned: false, banReason: null })
          .where(eq(users.id, id));
        return Response.json({ ok: true });
      }
      default:
        return Response.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (err) {
    if (err instanceof BettingError)
      return Response.json({ error: err.message }, { status: 400 });
    console.error("admin user action error", err);
    return Response.json({ error: "Action failed." }, { status: 500 });
  }
}
