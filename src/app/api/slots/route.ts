import { NextRequest, NextResponse } from "next/server";
import { slotsForDate, expireStale } from "@/lib/booking";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date required (YYYY-MM-DD)" }, { status: 400 });
  }
  try {
    await expireStale().catch(() => {}); // lazy expiry: cheap, usually zero rows
    const { slots, settings } = await slotsForDate(date, { showNames: false });
    return NextResponse.json({
      slots,
      slotMinutes: settings.slot_minutes,
      maxMinutes: settings.max_booking_minutes,
      showNames: settings.public_shows_names,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
