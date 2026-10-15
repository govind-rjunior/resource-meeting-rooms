import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { getSettings } from "@/lib/settings";
import { monthGrid, parseMonth, monthKey } from "@/lib/grid";
import { localDateStr, localTimeStr, hoursBetween, label12 } from "@/lib/time";

export const dynamic = "force-dynamic";

const csv = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// ?month=YYYY-MM            -> one row per booking
// ?month=YYYY-MM&format=grid -> the Excel-style grid (times down, days across)
export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return new NextResponse("Unauthorized", { status: 401 });
  const settings = await getSettings();
  const { y, m } = parseMonth(req.nextUrl.searchParams.get("month") ?? undefined, settings.timezone);
  const grid = await monthGrid(y, m, { showNames: true });
  const tz = settings.timezone;
  let body: string;
  if (req.nextUrl.searchParams.get("format") === "grid") {
    const header = ["From", "To", ...Array.from({ length: grid.days }, (_, i) => String(i + 1))];
    const rows = grid.times.map((t, i) => {
      const next = grid.times[i + 1] ?? settings.close_time.slice(0, 5);
      return [label12(t), label12(next), ...Array.from({ length: grid.days }, (_, d) => grid.cells[`${d + 1}|${t}`]?.name ?? "")];
    });
    body = [header, ...rows].map((r) => r.map(csv).join(",")).join("\n");
  } else {
    const header = ["Date", "Start", "End", "Hours", "Name", "Company", "Type", "Status", "Free hours", "Paid hours", "Charge", "Paid", "Email", "Phone", "Note"];
    const rows = grid.bookings.map((b) => {
      const s = new Date(b.start_at), e = new Date(b.end_at);
      return [
        localDateStr(tz, s), localTimeStr(tz, s), localTimeStr(tz, e), hoursBetween(s, e),
        b.display_name, b.company, b.kind, b.status, b.free_hours, b.paid_hours, b.charge, b.paid ? "yes" : "no",
        b.contact_email, b.contact_phone, b.note,
      ];
    });
    body = [header, ...rows].map((r) => r.map(csv).join(",")).join("\n");
  }
  return new NextResponse("﻿" + body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="meeting-room-${monthKey(y, m)}${req.nextUrl.searchParams.get("format") === "grid" ? "-grid" : ""}.csv"`,
    },
  });
}
