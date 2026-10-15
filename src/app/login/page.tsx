import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminToken, passwordMatches, ADMIN_COOKIE } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; err?: string }> }) {
  const sp = await searchParams;

  async function login(form: FormData) {
    "use server";
    const pw = String(form.get("password") ?? "");
    const next = String(form.get("next") ?? "/admin");
    if (!passwordMatches(pw)) redirect(`/login?err=1&next=${encodeURIComponent(next)}`);
    const jar = await cookies();
    jar.set(ADMIN_COOKIE, adminToken(), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    redirect(next.startsWith("/admin") ? next : "/admin");
  }

  return (
    <main className="mx-auto max-w-sm px-4 py-24">
      <h1 className="text-xl font-semibold">Front desk login</h1>
      <form action={login} className="mt-6 space-y-3">
        <input type="hidden" name="next" value={sp.next ?? "/admin"} />
        <input
          type="password"
          name="password"
          placeholder="Admin password"
          autoFocus
          className="w-full rounded-md border border-zinc-300 px-3 py-2"
        />
        {sp.err && <p className="text-sm text-red-700">Wrong password.</p>}
        <button className="w-full rounded-md bg-zinc-900 px-4 py-2 text-white">Sign in</button>
      </form>
    </main>
  );
}
