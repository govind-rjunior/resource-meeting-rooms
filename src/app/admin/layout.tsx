import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // middleware redirects when the cookie is missing; this rejects a stale or forged one
  if (!(await isAdmin())) redirect("/login?next=/admin");
  const nav = [
    ["/admin", "Grid"],
    ["/admin/requests", "Requests"],
    ["/admin/people", "People"],
    ["/admin/tenants", "Tenants"],
    ["/admin/settings", "Settings"],
  ];
  return (
    <div className="min-h-screen bg-zinc-50">
      <nav className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-1 px-4 py-2 text-sm">
          <span className="mr-3 font-semibold">Front desk</span>
          {nav.map(([href, label]) => (
            <Link key={href} href={href} className="rounded px-2 py-1 hover:bg-zinc-100">
              {label}
            </Link>
          ))}
          <Link href="/admin/new" className="rounded bg-zinc-900 px-2 py-1 text-white">
            + Booking
          </Link>
          <span className="ml-auto flex gap-2">
            <Link href="/schedule" className="rounded px-2 py-1 text-zinc-600 hover:bg-zinc-100">
              Public view
            </Link>
            <form action="/logout" method="post">
              <button className="rounded px-2 py-1 text-zinc-600 hover:bg-zinc-100">Sign out</button>
            </form>
          </span>
        </div>
      </nav>
      <div className="mx-auto max-w-[1400px] px-4 py-5">{children}</div>
    </div>
  );
}
