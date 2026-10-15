import { db } from "./db";
import { getSettings, getRoom } from "./settings";
import { zonedToUtc, daysInMonth, minutesOf, timeFromMinutes, utcToLocal } from "./time";
import type { Booking, BookingStatus, BookingKind } from "./types";

export interface GridCell {
  bookingId: string;
  name: string;
  status: BookingStatus;
  kind: BookingKind;
  paid: boolean;
  isStart: boolean; // first slot of the booking (where the name is printed)
}

export interface MonthGrid {
  year: number;
  month: number; // 1-12
  days: number;
  weekdays: number[]; // per day, 0 = Sunday
  times: string[]; // slot start times
  cells: Record<string, GridCell>; // key `${day}|${time}`
  bookings: Booking[];
  today: { y: number; m: number; d: number };
}

export async function monthGrid(year: number, month: number, opts: { showNames: boolean }): Promise<MonthGrid> {
  const settings = await getSettings();
  const room = await getRoom();
  const tz = settings.timezone;
  const days = daysInMonth(year, month);
  const from = zonedToUtc(tz, year, month, 1, 0, 0);
  const to = zonedToUtc(tz, year, month, days, 23, 59);
  const { data } = await db()
    .from("bookings")
    .select("*")
    .eq("room_id", room.id)
    .in("status", ["pending_email", "pending_admin", "confirmed"])
    .lt("start_at", to.toISOString())
    .gt("end_at", from.toISOString())
    .order("start_at");
  const bookings = (data ?? []) as Booking[];

  const open = minutesOf(settings.open_time);
  const close = minutesOf(settings.close_time);
  const times: string[] = [];
  for (let m = open; m + settings.slot_minutes <= close; m += settings.slot_minutes) times.push(timeFromMinutes(m));

  const cells: Record<string, GridCell> = {};
  for (const b of bookings) {
    const s = utcToLocal(tz, new Date(b.start_at));
    const e = new Date(b.end_at).getTime();
    let cursor = new Date(b.start_at).getTime();
    let first = true;
    // walk slot by slot; a booking never crosses midnight in practice
    while (cursor < e) {
      const p = utcToLocal(tz, new Date(cursor));
      if (p.m === month && p.y === year) {
        const key = `${p.d}|${timeFromMinutes(p.hh * 60 + p.mm)}`;
        cells[key] = {
          bookingId: b.id,
          name:
            b.kind === "block"
              ? b.display_name || "Blocked"
              : opts.showNames
                ? b.display_name
                : b.status === "confirmed"
                  ? "Booked"
                  : "Pending",
          status: b.status,
          kind: b.kind,
          paid: b.paid,
          isStart: first,
        };
      }
      first = false;
      cursor += settings.slot_minutes * 60000;
    }
    void s;
  }
  const weekdays: number[] = [];
  for (let d = 1; d <= days; d++) weekdays.push(utcToLocal(tz, zonedToUtc(tz, year, month, d, 12, 0)).weekday);
  const now = utcToLocal(tz, new Date());
  return { year, month, days, weekdays, times, cells, bookings, today: { y: now.y, m: now.m, d: now.d } };
}

export function parseMonth(s: string | undefined, tz: string): { y: number; m: number } {
  const now = utcToLocal(tz, new Date());
  if (s && /^\d{4}-\d{2}$/.test(s)) {
    const [y, m] = s.split("-").map(Number);
    if (m >= 1 && m <= 12) return { y, m };
  }
  return { y: now.y, m: now.m };
}

export function monthKey(y: number, m: number): string {
  return `${y}-${m < 10 ? "0" + m : m}`;
}

export function shiftMonth(y: number, m: number, by: number): { y: number; m: number } {
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 };
}
