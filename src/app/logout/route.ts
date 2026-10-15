import { NextResponse } from "next/server";
import { ADMIN_COOKIE } from "@/lib/admin-auth";

// POST only. A GET handler here would be executed by Next.js link prefetching
// and silently log the admin out as soon as the nav rendered.
export async function POST(req: Request) {
  const res = NextResponse.redirect(new URL("/login", req.url), { status: 303 });
  res.cookies.set(ADMIN_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
