import { db } from "@/db";
import { users } from "@/db/schema";
import { sql } from "drizzle-orm";
import { hashPassword } from "@/lib/passwords";
import { createSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const username = String(body?.username ?? "").trim();
    const password = String(body?.password ?? "");

    if (!USERNAME_RE.test(username))
      return Response.json(
        { error: "Username must be 3–20 characters: letters, numbers, underscores." },
        { status: 400 },
      );
    if (password.length < 6)
      return Response.json({ error: "Password must be at least 6 characters." }, { status: 400 });

    const clash = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.username}) = lower(${username})`)
      .limit(1);
    if (clash.length > 0)
      return Response.json({ error: "That username is already taken." }, { status: 409 });

    // New accounts start at €0.00 — the admin funds wallets manually. No bonus.
    const [user] = await db
      .insert(users)
      .values({ username, passwordHash: await hashPassword(password), balanceCents: 0 })
      .returning({
        id: users.id,
        username: users.username,
        balanceCents: users.balanceCents,
        isAdmin: users.isAdmin,
      });

    await createSession(user.id, req.headers.get("user-agent"));
    return Response.json({ user });
  } catch (err) {
    console.error("SIGNUP_ERROR:", err);
    const code = (err as { code?: string })?.code ?? "UNKNOWN";
    const msg = String((err as Error)?.message ?? err).slice(0, 200);
    return Response.json(
      { error: "Could not create your account. Try again.", debug: code, detail: msg },
      { status: 500 },
    );
  }
}
