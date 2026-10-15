import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { todayLocal } from "@/lib/booking";
import type { Tenant } from "@/lib/types";
import Flash from "@/components/flash";
import { actCreateBooking } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewBooking({ searchParams }: { searchParams: Promise<{ date?: string; time?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const settings = await getSettings();
  const { data } = await db().from("tenants").select("*").eq("active", true).order("name");
  const tenants = (data ?? []) as Tenant[];
  const input = "w-full rounded-md border border-zinc-300 px-3 py-2 text-sm";
  const durations: number[] = [];
  for (let m = settings.slot_minutes; m <= 12 * 60; m += settings.slot_minutes) durations.push(m);
  return (
    <div className="max-w-xl">
      <Flash ok={sp.ok} err={sp.err} />
      <h1 className="text-lg font-semibold">Add a booking</h1>
      <p className="mt-1 text-sm text-zinc-600">
        For walk-ins, phone bookings, blocking the room, or booking on a member&apos;s behalf. Confirmed immediately, no email
        verification. Walk-ins are charged at the external rate; blocks count against nobody.
      </p>
      <form action={actCreateBooking} className="mt-4 space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <label className="text-sm">
            Date
            <input type="date" name="date" defaultValue={sp.date ?? todayLocal(settings.timezone)} className={input} required />
          </label>
          <label className="text-sm">
            Start
            <input type="time" name="time" defaultValue={sp.time ?? settings.open_time.slice(0, 5)} step={settings.slot_minutes * 60} className={input} required />
          </label>
          <label className="text-sm">
            Duration
            <select name="minutes" defaultValue={60} className={input}>
              {durations.map((m) => (
                <option key={m} value={m}>
                  {m % 60 === 0 ? `${m / 60} h` : `${Math.floor(m / 60)} h ${m % 60} m`}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block text-sm">
          Type
          <select name="kind" className={input} defaultValue="walkin">
            <option value="walkin">Walk-in / non-member (external rate)</option>
            <option value="member">On behalf of a member (counts against their tenant)</option>
            <option value="block">Block the room (maintenance, event; no charge)</option>
          </select>
        </label>
        <label className="block text-sm">
          Tenant (only for &quot;on behalf of a member&quot;)
          <select name="tenant_id" className={input} defaultValue="">
            <option value="">–</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Name (shown on the grid)
            <input name="name" className={input} required />
          </label>
          <label className="text-sm">
            Company
            <input name="company" className={input} />
          </label>
          <label className="text-sm">
            Email (gets the confirmation; optional)
            <input type="email" name="email" className={input} />
          </label>
          <label className="text-sm">
            Phone
            <input name="phone" className={input} />
          </label>
        </div>
        <label className="block text-sm">
          Note
          <input name="note" className={input} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="paid" /> Already paid
        </label>
        <button className="rounded bg-zinc-900 px-4 py-2 text-sm text-white">Add booking</button>
      </form>
    </div>
  );
}
