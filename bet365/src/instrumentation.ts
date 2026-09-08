export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { ensureAdminAccount } = await import("@/lib/bootstrap");
      await ensureAdminAccount();
      // Retry once — the DB may still be warming up on first boot.
    } catch (err) {
      console.warn("[bootstrap] admin seed failed:", (err as Error)?.message ?? err);
      setTimeout(async () => {
        try {
          const { ensureAdminAccount } = await import("@/lib/bootstrap");
          await ensureAdminAccount();
        } catch (err2) {
          console.warn("[bootstrap] retry failed:", (err2 as Error)?.message ?? err2);
        }
      }, 5000);
    }
  }
}
