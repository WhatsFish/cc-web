import { redirect } from "next/navigation";
import { currentSession } from "@/lib/auth/require";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // If already signed in, skip the form.
  const session = await currentSession();
  if (session) redirect("/");
  return <LoginForm />;
}
