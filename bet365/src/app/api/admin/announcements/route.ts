import { db } from "@/db";
import { announcements } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "Forbidden." }, { status: 403 });
  const rows = await db
    .select()
    .from(announcements)
    .orderBy(desc(announcements.createdAt))
    .limit(30);
  return Response.json({ announcements: rows });
}

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "Forbidden." }, { status: 403 });
  const body = await req.json().catch(() => null);
  const message = String(body?.message ?? "").trim().slice(0, 300);
  const tone = ["info", "gold", "alert"].includes(body?.tone) ? body.tone : "info";
  if (!message) return Response.json({ error: "Message cannot be empty." }, { status: 400 });
  const [row] = await db
    .insert(announcements)
    .values({ message, tone, active: true })
    .returning();
  return Response.json({ announcement: row });
}

export async function PATCH(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "Forbidden." }, { status: 403 });
  const body = await req.json().catch(() => null);
  const id = String(body?.id ?? "");
  const active = Boolean(body?.active);
  if (!id) return Response.json({ error: "id required." }, { status: 400 });
  await db.update(announcements).set({ active }).where(eq(announcements.id, id));
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "Forbidden." }, { status: 403 });
  const body = await req.json().catch(() => null);
  const id = String(body?.id ?? "");
  if (!id) return Response.json({ error: "id required." }, { status: 400 });
  await db.delete(announcements).where(eq(announcements.id, id));
  return Response.json({ ok: true });
}
