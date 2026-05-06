import { cookies } from "next/headers";
import { nanoid } from "nanoid";

const COOKIE = "nbrag_sid";

export async function resolveSessionId(): Promise<{ id: string; created: boolean }> {
  const jar = await cookies();
  const existing = jar.get(COOKIE)?.value;
  if (existing) return { id: existing, created: false };
  const id = nanoid(16);
  jar.set(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24,
  });
  return { id, created: true };
}
