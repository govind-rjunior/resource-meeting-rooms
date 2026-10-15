import { getSettings, getRoom } from "@/lib/settings";
import Flash from "@/components/flash";
import { actSaveSettings } from "../actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const s = await getSettings();
  const room = await getRoom();
  const input = "w-full rounded-md border border-zinc-300 px-3 py-2 text-sm";
  const L = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <label className="block text-sm">
      <span className="text-zinc-600">{label}</span>
      {children}
    </label>
  );
  return (
    <div className="max-w-2xl">
      <Flash ok={sp.ok} err={sp.err} />
      <h1 className="text-lg font-semibold">Settings</h1>
      <form action={actSaveSettings} className="mt-4 space-y-5">
        <input type="hidden" name="room_id" value={room.id} />
        <section className="grid gap-3 sm:grid-cols-2">
          <L label="Workspace name"><input name="space_name" defaultValue={s.space_name} className={input} /></L>
          <L label="Front desk email (gets every request)"><input type="email" name="front_desk_email" defaultValue={s.front_desk_email} className={input} /></L>
          <L label="Room name"><input name="room_name" defaultValue={room.name} className={input} /></L>
          <L label="Room seats"><input type="number" name="room_capacity" defaultValue={room.capacity} className={input} /></L>
        </section>
        <section className="grid gap-3 sm:grid-cols-3">
          <L label="Opens"><input type="time" name="open_time" defaultValue={s.open_time.slice(0, 5)} className={input} /></L>
          <L label="Closes"><input type="time" name="close_time" defaultValue={s.close_time.slice(0, 5)} className={input} /></L>
          <L label="Slot (minutes)"><input type="number" name="slot_minutes" defaultValue={s.slot_minutes} className={input} /></L>
          <L label="Max booking (minutes)"><input type="number" name="max_booking_minutes" defaultValue={s.max_booking_minutes} className={input} /></L>
          <L label="Members book ahead (days)"><input type="number" name="member_horizon_days" defaultValue={s.member_horizon_days} className={input} /></L>
          <L label="Non-members book ahead (days)"><input type="number" name="external_horizon_days" defaultValue={s.external_horizon_days} className={input} /></L>
          <L label="Cancel cut-off (minutes before start)"><input type="number" name="cancel_cutoff_minutes" defaultValue={s.cancel_cutoff_minutes} className={input} /></L>
          <L label="Default free hours a month per tenant"><input type="number" step="0.5" name="default_free_hours" defaultValue={s.default_free_hours} className={input} /></L>
          <L label="Member rate per hour beyond free (₹)"><input type="number" name="member_rate" defaultValue={s.member_rate} className={input} /></L>
          <L label="External rate per hour (₹)"><input type="number" name="external_rate" defaultValue={s.external_rate} className={input} /></L>
        </section>
        <section className="space-y-2 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" name="weekend_open" defaultChecked={s.weekend_open} /> Open on Saturday and Sunday</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="approval_required" defaultChecked={s.approval_required} /> Every member request needs the front desk&apos;s Confirm (off = instant booking for linked members; externals always need Confirm)</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="public_shows_names" defaultChecked={s.public_shows_names} /> Show booker names on the public schedule (off = &quot;Booked&quot;)</label>
        </section>
        <button className="rounded bg-zinc-900 px-4 py-2 text-sm text-white">Save</button>
      </form>
    </div>
  );
}
