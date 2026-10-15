import { NextRequest, NextResponse } from "next/server";

// Gate /admin behind the login cookie. Login lives at /login and the one-click
// email actions at /act/<token>, both outside this gate.
// The cookie value is checked for real in the server code (admin-auth.ts);
// here we only redirect when it is absent, to keep the edge runtime simple.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/admin")) {
    const has = req.cookies.get("mr_admin")?.value;
    if (!has) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname + (req.nextUrl.search || ""));
      return NextResponse.redirect(url);
    }
  }
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*"] };
