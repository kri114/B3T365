import webpush from "web-push";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";

/**
 * Web Push delivery.
 *
 * Requires a VAPID key pair in the environment:
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, (optional) VAPID_SUBJECT
 * Generate once with:  npx web-push generate-vapid-keys
 */
let configured: boolean | null = null;

export function pushReady(): boolean {
  if (configured !== null) return configured;
  const pub = process.env.VAPID_PUBLIC_KEY?.trim();
  const priv = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!pub || !priv) {
    configured = false;
    return false;
  }
  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT?.trim() || "mailto:admin@bet365.local",
      pub,
      priv,
    );
    configured = true;
  } catch {
    configured = false;
  }
  return configured;
}

export type PushPayload = {
  title: string;
  body: string;
  tag?: string;
  url?: string;
  /** Rendered under the score inside the notification. */
  odds?: string;
};

/** Send a notification to every device registered by these users. */
export async function sendToUsers(userIds: string[], payload: PushPayload): Promise<number> {
  if (!pushReady() || userIds.length === 0) return 0;

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.userId, userIds));
  if (subs.length === 0) return 0;

  const body = JSON.stringify(payload);
  let sent = 0;
  const dead: string[] = [];

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
        sent++;
      } catch (err) {
        const code = (err as { statusCode?: number })?.statusCode;
        // 404/410 → the browser dropped the subscription; prune it.
        if (code === 404 || code === 410) dead.push(s.endpoint);
      }
    }),
  );

  for (const endpoint of dead) {
    await db
      .delete(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint))
      .catch(() => {});
  }
  return sent;
}
