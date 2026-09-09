import { db } from "@/db";
import { userReports, users } from "@/db/schema";
import { getSessionUser, requireAdmin } from "@/lib/auth";
import { and, desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** Players file reports; admins read them via /api/admin/reports. */
export async function POST(req: Request) {
  const me = await getSessionUser();
  if (!me) return Response.json({ error: "Sign in first." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const reportedId = String(body?.userId ?? "");
  const reason = String(body?.reason ?? "").trim().slice(0, 400);
  const context = body?.context ? String(body.context).slice(0, 400) : null;

  if (!reportedId || !reason)
    return Response.json({ error: "Tell us what happened." }, { status: 400 });
  if (reportedId === me.id)
    return Response.json({ error: "You can't report yourself." }, { status: 400 });

  const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, reportedId)).limit(1);
  if (!target) return Response.json({ error: "Player not found." }, { status: 404 });

  const dupe = await db
    .select({ id: userReports.id })
    .from(userReports)
    .where(
      and(
        eq(userReports.reporterId, me.id),
        eq(userReports.reportedId, reportedId),
        eq(userReports.status, "open"),
      ),
    )
    .limit(1);
  if (dupe.length > 0)
    return Response.json(
      { error: "You've already reported this player — the house is reviewing it." },
      { status: 409 },
    );

  await db.insert(userReports).values({ reporterId: me.id, reportedId, reason, context });
  return Response.json({ ok: true });
}

/** Admin: list reports. */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "Forbidden." }, { status: 403 });

  const reporter = { username: users.username };
  const rows = await db
    .select({
      report: userReports,
      reportedName: users.username,
      reportedId: users.id,
      reportedBanned: users.isBanned,
    })
    .from(userReports)
    .innerJoin(users, eq(userReports.reportedId, users.id))
    .orderBy(desc(userReports.createdAt))
    .limit(100);

  void reporter;
  const names = await db.select({ id: users.id, username: users.username }).from(users);
  const nameById = new Map(names.map((n) => [n.id, n.username]));

  return Response.json({
    reports: rows.map((r) => ({
      ...r,
      reporterName: nameById.get(r.report.reporterId) ?? "?",
    })),
  });
}

/** Admin: resolve a report. */
export async function PATCH(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "Forbidden." }, { status: 403 });
  const body = await req.json().catch(() => null);
  const id = String(body?.id ?? "");
  const status = body?.status === "actioned" ? "actioned" : "dismissed";
  if (!id) return Response.json({ error: "id required." }, { status: 400 });
  await db.update(userReports).set({ status }).where(eq(userReports.id, id));
  return Response.json({ ok: true });
}
