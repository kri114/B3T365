/**
 * Next.js instrumentation hook — runs once per server process start.
 *
 * The admin seed re-attempts for up to ~2 minutes without blocking boot, so
 * it survives the classic hosted-deploy race where the server starts before
 * `drizzle-kit push` has created the tables (or the DB is still waking up).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  void (async () => {
    const MAX_ATTEMPTS = 24; // 24 × 5s ≈ 2 minutes
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const { ensureAdminAccount } = await import("@/lib/bootstrap");
        await ensureAdminAccount();
        return;
      } catch (err) {
        if (attempt === 1 || attempt % 6 === 0) {
          console.warn(
            `[bootstrap] admin seed attempt ${attempt}/${MAX_ATTEMPTS} failed:`,
            (err as Error)?.message ?? err,
          );
        }
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
    console.warn(
      "[bootstrap] gave up seeding admin. Run `npx drizzle-kit push`, then `node scripts/reset-admin.mjs`, and restart.",
    );
  })();
}
