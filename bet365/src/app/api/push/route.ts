import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { pushReady, sendToUsers } from "@/lib/push";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** Public VAPID key + whether push is configured on this server. */
export async function GET() {
  return Response.json({
    enabled: pushReady(),
    publicKey: process.env.VAPID_PUBLIC_KEY?.trim() ?? null,
  });
}

/** Register (or refresh) this browser's push subscription. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (!pushReady())
    return Response.json(
      { error: "Push is not configured on the server (missing VAPID keys)." },
      { status: 501 },
    );

  const body = await req.json().catch(() => null);
  const endpoint = String(body?.endpoint ?? "");
  const p256dh = String(body?.keys?.p256dh ?? "");
  const auth = String(body?.keys?.auth ?? "");
  if (!endpoint || !p256dh || !auth)
    return Response.json({ error: "Invalid subscription." }, { status: 400 });

  await db
    .insert(pushSubscriptions)
    .values({ endpoint, userId: user.id, p256dh, auth })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId: user.id, p256dh, auth },
    });

  await sendToUsers([user.id], {
    title: "🔔 Alerts enabled",
    body: "You'll get goals, kick-off, half time and full time for matches you follow.",
    tag: "welcome",
  });

  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const body = await req.json().catch(() => null);
  const endpoint = String(body?.endpoint ?? "");
  if (endpoint) {
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
  }
  return Response.json({ ok: true });
}
