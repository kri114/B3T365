import { requireAdmin } from "@/lib/auth";
import { BettingError, overrideBet } from "@/lib/betting";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/bets/{id} — force a bet's outcome.
 * Body: { action: "won" | "lost" | "void" }
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "Forbidden." }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const action = body?.action;

  if (action !== "won" && action !== "lost" && action !== "void")
    return Response.json({ error: "action must be won | lost | void." }, { status: 400 });

  try {
    await overrideBet(id, action, admin.id);
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof BettingError)
      return Response.json({ error: err.message }, { status: 400 });
    console.error("override error", err);
    return Response.json({ error: "Override failed." }, { status: 500 });
  }
}
