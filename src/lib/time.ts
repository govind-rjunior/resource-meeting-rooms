// Time helpers. All wall-clock times are in the space's timezone
// (settings.timezone, Asia/Kolkata by default). The database stores UTC.

export function tzOffsetMinutes(tz: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second")
  );
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** Local wall-clock (y, m, d, hh, mm) in tz -> UTC Date */
export function zonedToUtc(
  tz: string,
  y: number,
  m: number,
  d: number,
  hh: number,
  mm: number
): Date {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const off = tzOffsetMinutes(tz, new Date(guess));
  return new Date(guess - off * 60000);
}

/** "2026-10-20" + "09:30" in tz -> UTC Date */
export function localDateTimeToUtc(tz: string, dateStr: string, timeStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  return zonedToUtc(tz, y, m, d, hh, mm);
}

export interface LocalParts {
  y: number;
  m: number;
  d: number;
  hh: number;
  mm: number;
  weekday: number; // 0 = Sunday
}

export function utcToLocal(tz: string, at: Date): LocalParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return {
    y: Number(get("year")),
    m: Number(get("month")),
    d: Number(get("day")),
    hh: Number(get("hour")),
    mm: Number(get("minute")),
    weekday: wd,
  };
}

export function localDateStr(tz: string, at: Date): string {
  const p = utcToLocal(tz, at);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

export function localTimeStr(tz: string, at: Date): string {
  const p = utcToLocal(tz, at);
  return `${pad(p.hh)}:${pad(p.mm)}`;
}

export function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function minutesOf(timeStr: string): number {
  const [hh, mm] = timeStr.split(":").map(Number);
  return hh * 60 + mm;
}

export function timeFromMinutes(mins: number): string {
  return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
}

/** 12-hour label: "09:30" -> "9:30 am" */
export function label12(timeStr: string): string {
  const [hh, mm] = timeStr.split(":").map(Number);
  const h = hh % 12 === 0 ? 12 : hh % 12;
  return `${h}:${pad(mm)} ${hh < 12 ? "am" : "pm"}`;
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function monthLabel(y: number, m: number): string {
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function fmtDateLong(tz: string, at: Date): string {
  return at.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: tz,
  });
}

export function fmtRange(tz: string, start: Date, end: Date): string {
  return `${fmtDateLong(tz, start)}, ${label12(localTimeStr(tz, start))} to ${label12(
    localTimeStr(tz, end)
  )}`;
}

export function hoursBetween(start: Date, end: Date): number {
  return Math.round(((end.getTime() - start.getTime()) / 3600000) * 100) / 100;
}

export function inr(n: number): string {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}
