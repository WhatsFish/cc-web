import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/require";
import { sessionExists, isValidName } from "@/lib/tmux";
import Terminal from "./Terminal";

export const dynamic = "force-dynamic";

export default async function TermPage({ params }: { params: { name: string } }) {
  await requireAuth();
  const name = decodeURIComponent(params.name);
  if (!isValidName(name) || !(await sessionExists(name))) {
    redirect("/sessions");
  }
  return <Terminal name={name} />;
}
