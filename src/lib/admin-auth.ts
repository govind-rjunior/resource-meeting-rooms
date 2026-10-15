import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";

export const ADMIN_COOKIE = "mr_admin";

function secret(): string {
  const s = process.env.ADMIN_PASSWORD;
  if (!s) throw new Error("ADMIN_PASSWORD is not set.");
  return s;
}

/** Token = HMAC of a fixed string with the admin password, so changing the password logs everyone out. */
export function adminToken(): string {
  return createHmac("sha256", secret()).update("meeting-room-admin-v1").digest("hex");
}

export function tokenIsValid(token: string | undefined | null): boolean {
  if (!token) return false;
  try {
    const a = Buffer.from(token);
    const b = Buffer.from(adminToken());
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function isAdmin(): Promise<boolean> {
  const jar = await cookies();
  return tokenIsValid(jar.get(ADMIN_COOKIE)?.value);
}

export function passwordMatches(input: string): boolean {
  const a = Buffer.from(input);
  const b = Buffer.from(secret());
  return a.length === b.length && timingSafeEqual(a, b);
}
