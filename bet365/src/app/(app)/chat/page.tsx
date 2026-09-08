import { ChatRoom } from "@/components/chat-room";

export const dynamic = "force-dynamic";

export default function ChatPage() {
  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-cream">Punters&apos; Lounge</h1>
        <p className="mt-0.5 text-[12px] text-faint">
          Talk fixtures, form and bad beats with everyone else in the house.
        </p>
      </header>
      <ChatRoom />
    </div>
  );
}
