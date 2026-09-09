import { ProfileView } from "@/components/profile-view";

export const dynamic = "force-dynamic";

export default function ProfilePage() {
  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-cream">Your Profile</h1>
        <p className="mt-0.5 text-[12px] text-faint">
          Picture, display name, colour, password — and your winning streak.
        </p>
      </header>
      <ProfileView />
    </div>
  );
}
