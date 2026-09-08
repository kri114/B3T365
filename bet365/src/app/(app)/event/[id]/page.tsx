import { EventBoard } from "@/components/event-board";

export const dynamic = "force-dynamic";

export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ league?: string }>;
}) {
  const { id } = await params;
  const { league } = await searchParams;
  if (!league) {
    return (
      <p className="rounded-xl border border-dashed border-line py-16 text-center text-sm text-mute">
        Missing league parameter.
      </p>
    );
  }
  return <EventBoard id={id} league={league} />;
}
