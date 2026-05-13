"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyCookieSignature, revokeSession } from "@/lib/auth/session";
import { COOKIE_NAME, COOKIE_PATH } from "@/lib/config";

export async function logout(): Promise<void> {
  const value = cookies().get(COOKIE_NAME)?.value;
  if (value) {
    const id = verifyCookieSignature(value);
    if (id) await revokeSession(id);
  }
  cookies().delete({ name: COOKIE_NAME, path: COOKIE_PATH });
  redirect("/login");
}
