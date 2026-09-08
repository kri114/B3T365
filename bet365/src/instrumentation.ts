/**
 * Next.js instrumentation hook — runs once per server process on `next start`.
 *
 * The server fully self-bootstraps on a fresh database, so a hosted deploy
 * needs NO shell, NO `drizzle-kit push` and NO custom start command:
 *
 *   1. create tables (idempotent DDL, src/lib/db-setup.ts)
 *   2. seed/recover the admin account (src/lib/bootstrap.ts)
 *
 * Both re-attempt for up to ~2 minutes without blocking boot, so they survive
 * the classic hosted race where the DB is still waking up or is cold.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  void (async () => {
    const MAX_ATTEMPTS = 24; // 24 × 5s ≈ 2 minutes
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const { ensureSchema } = await import("@/lib/db-setup");
        await ensureSchema();
        const { ensureAdminAccount } = await import("@/lib/bootstrap");
        await ensureAdminAccount();
        return;
      } catch (err) {
        if (attempt === 1 || attempt % 6 === 0) {
          console.warn(
            `[bootstrap] schema/admin attempt ${attempt}/${MAX_ATTEMPTS} failed:`,
            (err as Error)?.message ?? err,
          );
        }
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
    console.warn(
      "[bootstrap] gave up after 2 minutes. Check that DATABASE_URL is set and reachable, then restart the service.",
    );
  })();
}
