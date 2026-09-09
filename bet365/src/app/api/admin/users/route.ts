import { db } from "@/db";
import { users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { openBetsByUser } from "@/lib/betting";
import { asc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "Forbidden." }, { status: 403 });

  const [allUsers, openCounts] = await Promise.all([
    db
      .select({
        id: users.id,
        username: users.username,
        balanceCents: users.balanceCents,
        debtCents: users.debtCents,
        creditLimitCents: users.creditLimitCents,
        isAdmin: users.isAdmin,
        isBanned: users.isBanned,
        banReason: users.banReason,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(asc(users.username)),
    openBetsByUser(),
  ]);

  return Response.json({
    users: allUsers.map((u) => ({ ...u, openBets: openCounts.get(u.id) ?? 0 })),
  });
}
