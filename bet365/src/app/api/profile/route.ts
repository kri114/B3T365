import { db } from "@/db";
import { passwordResetRequests, users } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/passwords";
import { and, desc, eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const MAX_AVATAR_CHARS = 200_000; // ~150KB data URL

export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  const [me] = await db
    .select({
      id: users.id,
      username: users.username,
      avatarUrl: users.avatarUrl,
      nameColor: users.nameColor,
      balanceCents: users.balanceCents,
      debtCents: users.debtCents,
      creditLimitCents: users.creditLimitCents,
      winStreak: users.winStreak,
      bestStreak: users.bestStreak,
      isAdmin: users.isAdmin,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  const [pending] = await db
    .select({ id: passwordResetRequests.id, status: passwordResetRequests.status, createdAt: passwordResetRequests.createdAt })
    .from(passwordResetRequests)
    .where(and(eq(passwordResetRequests.userId, user.id), eq(passwordResetRequests.status, "pending")))
    .orderBy(desc(passwordResetRequests.createdAt))
    .limit(1);

  return Response.json({ profile: me, pendingReset: pending ?? null });
}

/** Update profile fields, change password, or request an admin password reset. */
export async function PATCH(req: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const action = String(body?.action ?? "profile");

  try {
    /* ---- appearance & username ---- */
    if (action === "profile") {
      const patch: Record<string, unknown> = {};

      if (body?.username !== undefined) {
        const username = String(body.username).trim();
        if (!USERNAME_RE.test(username))
          return Response.json(
            { error: "Username must be 3–20 characters: letters, numbers, underscores." },
            { status: 400 },
          );
        if (username.toLowerCase() !== user.username.toLowerCase()) {
          const clash = await db
            .select({ id: users.id })
            .from(users)
            .where(sql`lower(${users.username}) = lower(${username})`)
            .limit(1);
          if (clash.length > 0)
            return Response.json({ error: "That username is already taken." }, { status: 409 });
        }
        patch.username = username;
      }

      if (body?.nameColor !== undefined) {
        const color = String(body.nameColor);
        if (!HEX_RE.test(color))
          return Response.json({ error: "Pick a valid colour." }, { status: 400 });
        patch.nameColor = color;
      }

      if (body?.avatarUrl !== undefined) {
        const avatar = body.avatarUrl === null ? null : String(body.avatarUrl);
        if (avatar !== null) {
          if (!avatar.startsWith("data:image/"))
            return Response.json({ error: "Avatar must be an image." }, { status: 400 });
          if (avatar.length > MAX_AVATAR_CHARS)
            return Response.json({ error: "That image is too large — try a smaller one." }, { status: 413 });
        }
        patch.avatarUrl = avatar;
      }

      if (Object.keys(patch).length === 0)
        return Response.json({ error: "Nothing to update." }, { status: 400 });

      await db.update(users).set(patch).where(eq(users.id, user.id));
      return Response.json({ ok: true });
    }

    /* ---- password change (requires the current password) ---- */
    if (action === "password") {
      const current = String(body?.currentPassword ?? "");
      const next = String(body?.newPassword ?? "");
      if (next.length < 6)
        return Response.json({ error: "New password must be at least 6 characters." }, { status: 400 });

      const [row] = await db
        .select({ passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);
      if (!row || !(await verifyPassword(current, row.passwordHash)))
        return Response.json(
          { error: "Current password is incorrect. If you've forgotten it, request an admin reset below." },
          { status: 401 },
        );

      await db
        .update(users)
        .set({ passwordHash: await hashPassword(next) })
        .where(eq(users.id, user.id));
      return Response.json({ ok: true, message: "Password changed." });
    }

    /* ---- forgotten password → ask the admin to approve a new one ---- */
    if (action === "requestReset") {
      const next = String(body?.newPassword ?? "");
      const note = body?.note ? String(body.note).slice(0, 200) : null;
      if (next.length < 6)
        return Response.json({ error: "Choose a new password of at least 6 characters." }, { status: 400 });

      const existing = await db
        .select({ id: passwordResetRequests.id })
        .from(passwordResetRequests)
        .where(and(eq(passwordResetRequests.userId, user.id), eq(passwordResetRequests.status, "pending")))
        .limit(1);
      if (existing.length > 0)
        return Response.json(
          { error: "You already have a reset request awaiting the house." },
          { status: 409 },
        );

      await db.insert(passwordResetRequests).values({
        userId: user.id,
        newPasswordHash: await hashPassword(next),
        note,
      });
      return Response.json({ ok: true, message: "Reset request sent to the house." });
    }

    return Response.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    console.error("PROFILE_ERROR:", err);
    return Response.json({ error: "Update failed. Try again." }, { status: 500 });
  }
}


