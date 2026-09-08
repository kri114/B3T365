import { db } from "@/db";
import { users } from "@/db/schema";
import { sql } from "drizzle-orm";
import { verifyPassword } from "@/lib/passwords";
import { createAdminSession, createSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const username = String(body?.username ?? "").trim();
    const password = String(body?.password ?? "");
    if (!username || !password)
      return Response.json({ error: "Username and password are required." }, { status: 400 });

    const [user] = await db
      .select()
      .from(users)
      .where(sql`lower(${users.username}) = lower(${username})`)
      .limit(1);

    if (!user || !(await verifyPassword(password, user.passwordHash)))
      return Response.json({ error: "Invalid username or password." }, { status: 401 });

    if (user.isBanned)
      return Response.json(
        { error: `This account is banned.${user.banReason ? ` Reason: ${user.banReason}` : ""}` },
        { status: 403 },
      );

    // The admin account is bound to a single device: signing in elsewhere
    // revokes every previous admin session automatically.
    if (user.isAdmin) await createAdminSession(user.id, req.headers.get("user-agent"));
    else await createSession(user.id, req.headers.get("user-agent"));

    return Response.json({
      user: {
        id: user.id,
        username: user.username,
        balanceCents: user.balanceCents,
        isAdmin: user.isAdmin,
      },
    });
  } catch (err) {
    console.error("login error", err);
    return Response.json({ error: "Sign-in failed. Try again." }, { status: 500 });
  }
}
