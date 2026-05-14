import { NextRequest, NextResponse } from "next/server";
import { currentSession } from "@/lib/auth/require";
import { isValidName, killSession, sessionExists } from "@/lib/tmux";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { name: string } },
): Promise<NextResponse> {
  if (!(await currentSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const name = params.name;
  if (!isValidName(name)) return NextResponse.json({ error: "invalid_name" }, { status: 400 });
  if (!(await sessionExists(name))) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await killSession(name);
  return NextResponse.json({ ok: true });
}
