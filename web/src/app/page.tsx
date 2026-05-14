import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/require";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await requireAuth();
  redirect("/sessions");
}
