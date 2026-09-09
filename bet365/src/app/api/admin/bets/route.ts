import { requireAdmin } from "@/lib/auth";
import { getAllBets, settleOpenBets } from "@/lib/betting";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "Forbidden." }, { status: 403 });
  await settleOpenBets().catch((err) => console.warn("[settle]", err?.message ?? err));
  const bets = await getAllBets();
  return Response.json({ bets });
}
