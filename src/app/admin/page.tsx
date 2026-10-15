import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { monthGrid, parseMonth, monthKey } from "@/lib/grid";
import { expireStale } from "@/lib/booking";
import { db } from "@/lib/db";
import MonthGridView from "@/components/month-grid";
import Flash from "@/components/flash";
import { pad } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ month?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  await expireStale().catch(() => {});
  const settings = await getSettings();
  const { y, m } = parseMonth(sp.month, settings.timezone);
  const grid = await monthGrid(y, m, { showNames: true });
  const { count: pending } = await db()
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending_admin");
  const { count: newPeople } = await db()
    .from("people")
    .select("id", { count: "exact", head: true })
    .eq("status", "verified");
  const dateFor = (d: number) => `${y}-${pad(m)}-${pad(d)}`;
  return (
    <div>
      <Flash ok={sp.ok} err={sp.err} />
      {(pending ?? 0) > 0 && (
        <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <b>{pending}</b> request{pending === 1 ? "" : "s"} waiting for your decision
          {(newPeople ?? 0) > 0 ? `, ${newPeople} new booker${newPeople === 1 ? "" : "s"} to link to a tenant` : ""}.{" "}
          <Link href="/admin/requests" className="underline">
            Open requests
          </Link>
        </p>
      )}
      <MonthGridView
        grid={grid}
        basePath="/admin"
        href={(d, t, id) => (id ? `/admin/requests/${id}` : `/admin/new?date=${dateFor(d)}&time=${t}`)}
      />
      <p className="mt-3 text-xs text-zinc-500">
        Click a booked cell to open it, an empty cell to add a booking there.{" "}
        <Link href={`/admin/export?month=${monthKey(y, m)}`} className="underline">
          Download this month as CSV
        </Link>
        {" · "}
        <Link href={`/admin/export?month=${monthKey(y, m)}&format=grid`} className="underline">
          Download as grid (like the Excel)
        </Link>
      </p>
    </div>
  );
}
