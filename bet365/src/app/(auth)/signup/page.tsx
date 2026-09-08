import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Create account — bet365 Virtual" };

export default function SignupPage() {
  return <AuthForm mode="signup" />;
}
