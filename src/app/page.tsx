import { getSettings, getRoom, getOffices } from "@/lib/settings";
import { todayLocal } from "@/lib/booking";
import BookingForm from "./booking-form";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [settings, room, offices] = await Promise.all([getSettings(), getRoom(), getOffices()]);
  const today = todayLocal(settings.timezone);
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-6">
        <p className="text-sm text-zinc-500">{settings.space_name}</p>
        <h1 className="text-2xl font-semibold tracking-tight">Book the {room.name}</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Seats {room.capacity}. Open {settings.open_time.slice(0, 5)} to {settings.close_time.slice(0, 5)}
          {settings.weekend_open ? ", every day" : ", Monday to Friday"}. Members get {settings.default_free_hours} free
          hours a month. No account needed.
        </p>
        <p className="mt-1 text-sm">
          <Link href="/schedule" className="underline text-zinc-700">
            See what is booked
          </Link>
        </p>
      </header>
      <BookingForm
        today={today}
        offices={offices}
        slotMinutes={settings.slot_minutes}
        maxMinutes={settings.max_booking_minutes}
        memberHorizon={settings.member_horizon_days}
        externalHorizon={settings.external_horizon_days}
        approvalRequired={settings.approval_required}
      />
    </main>
  );
}
