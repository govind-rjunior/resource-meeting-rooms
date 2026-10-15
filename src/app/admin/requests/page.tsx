import Link from "next/link";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { fmtRange, inr } from "@/lib/time";
import { expireStale } from "@/lib/booking";
import type { Booking, Person } from "@/lib/types";
import Flash from "@/components/flash";
import { actConfirm, actReject } from "../actions";

export const dynamic = "force-dynamic";

const badge: Record<string, string> = {
  pending_admin: "bg-amber-100 text-amber-900",
  pending_email: "bg-zinc-100 text-zinc-700",
  confirmed: "bg-green-100 text-green-900",
  rejected: "bg-red-100 text-red-900",
  expired: "bg-zinc-200 text-zinc-700",
  cancelled: "bg-zinc-200 text-zinc-700",
};

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; all?: string }> }) {
  const sp = await searchParams;
  await expireStale().catch(() => {});
  const settings = await getSettings();
  const q = db().from("bookings").select("*").order("start_at", { ascending: true });
  const { data } = sp.all
    ? await q.gt("end_at", new Date(Date.now() - 30 * 86400000).toISOString()).limit(500)
    : await q.in("status", ["pending_admin", "pending_email"]).gt("end_at", new Date().toISOString());
  const bookings = (data ?? []) as Booking[];
  const personIds = [...new Set(bookings.map((b) => b.person_id).filter(Boolean))] as string[];
  const { data: ppl } = personIds.length
    ? await db().from("people").select("*").in("id", personIds)
    : { data: [] };
  const people = new Map(((ppl ?? []) as Person[]).map((p) => [p.id, p]));
  return (
    <div>
      <Flash ok={sp.ok} err={sp.err} />
      <div className="mb-3 flex items-baseline gap-4">
        <h1 className="text-lg font-semibold">{sp.all ? "All bookings, last 30 days onward" : "Waiting for a decision"}</h1>
        <Link href={sp.all ? "/admin/requests" : "/admin/requests?all=1"} className="text-sm underline">
          {sp.all ? "Show only pending" : "Show all"}
        </Link>
      </div>
      {bookings.length === 0 && <p className="text-sm text-zinc-600">Nothing waiting.</p>}
      <div className="space-y-2">
        {bookings.map((b) => {
          const p = b.person_id ? people.get(b.person_id) : undefined;
          const needsTenant = b.kind === "member" && p && !p.tenant_id;
          return (
            <div key={b.id} className="flex flex-wrap items-center gap-3 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm">
              <span className={"rounded px-2 py-0.5 text-xs " + (badge[b.status] ?? "")}>{b.status.replace("_", " ")}</span>
              <span className="font-medium">{fmtRange(settings.timezone, new Date(b.start_at), new Date(b.end_at))}</span>
              <span>
                <Link href={`/admin/requests/${b.id}`} className="underline">
                  {b.display_name}
                </Link>
                {b.company ? ` · ${b.company}` : ""}
                {b.kind !== "member" ? ` · ${b.kind}` : ""}
                {b.status === "confirmed" && b.charge > 0 ? ` · ${inr(Number(b.charge))}${b.paid ? " paid" : " due"}` : ""}
              </span>
              {needsTenant && <span className="rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-900">new booker: needs a tenant</span>}
              {b.status === "pending_admin" && (
                <span className="ml-auto flex gap-2">
                  {needsTenant ? (
                    <Link href={`/admin/requests/${b.id}`} className="rounded bg-zinc-900 px-3 py-1 text-white">
                      Open to confirm
                    </Link>
                  ) : (
                    <form action={actConfirm}>
                      <input type="hidden" name="id" value={b.id} />
                      <input type="hidden" name="return" value="/admin/requests" />
                      <button className="rounded bg-emerald-700 px-3 py-1 text-white">Confirm</button>
                    </form>
                  )}
                  <form action={actReject}>
                    <input type="hidden" name="id" value={b.id} />
                    <input type="hidden" name="return" value="/admin/requests" />
                    <button className="rounded bg-red-700 px-3 py-1 text-white">Reject</button>
                  </form>
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
