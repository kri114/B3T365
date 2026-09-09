import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AdminConsole } from "@/components/admin-console";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getSessionUser().catch(() => null);
  if (!user?.isAdmin) redirect("/");
  return <AdminConsole />;
}
