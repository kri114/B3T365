import { Suspense } from "react";
import { db } from "@/db";
import { announcements } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { TopNav } from "@/components/top-nav";
import { LeagueSidebar } from "@/components/league-sidebar";
import { BetSlip } from "@/components/bet-slip";
import { AnnouncementBanner } from "@/components/announcement-banner";
import { DateStrip } from "@/components/date-strip";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let notes: { id: string; message: string; tone: string; createdAt: Date }[] = [];
  try {
    notes = await db
      .select({
        id: announcements.id,
        message: announcements.message,
        tone: announcements.tone,
        createdAt: announcements.createdAt,
      })
      .from(announcements)
      .where(eq(announcements.active, true))
      .orderBy(desc(announcements.createdAt))
      .limit(3);
  } catch {
    // DB not migrated yet — banner simply stays hidden.
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <TopNav />
      <Suspense fallback={<div className="h-[54px] border-b border-line bg-coal/90" />}>
        <DateStrip />
      </Suspense>
      <AnnouncementBanner initial={notes.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() })) as never} />
      <div className="mx-auto flex w-full max-w-[1500px] flex-1 items-start">
        <LeagueSidebar />
        <main className="min-w-0 flex-1 px-3 py-5 sm:px-5">{children}</main>
        <BetSlip />
      </div>
      <footer className="border-t border-line bg-coal/60">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-2 px-5 py-6 text-[11px] leading-relaxed text-faint sm:flex-row sm:items-center sm:justify-between">
          <p>
            <span className="font-display text-[13px] font-semibold">
              <span className="text-cream">bet</span>
              <span className="gold-text">365</span>
            </span>
            <span className="ml-2">— a private virtual sportsbook demo. Not affiliated with any real bookmaker.</span>
          </p>
          <p>Virtual euros only · No real-money gambling · 18+</p>
        </div>
      </footer>
    </div>
  );
}
