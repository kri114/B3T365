import { MessagesView } from "@/components/messages-view";

export const dynamic = "force-dynamic";

export default function MessagesPage() {
  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-cream">Messages</h1>
        <p className="mt-0.5 text-[12px] text-faint">
          Private conversations with other players. Search anyone by name.
        </p>
      </header>
      <MessagesView />
    </div>
  );
}
