import Link from "next/link";
import type { MonthGrid } from "@/lib/grid";
import { monthLabel, label12 } from "@/lib/time";
import { monthKey, shiftMonth } from "@/lib/grid";

const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function cellClass(c: { status: string; kind: string; paid: boolean } | undefined, past: boolean, weekend: boolean) {
  if (!c) return weekend ? "bg-zinc-50" : past ? "bg-white" : "bg-white";
  if (c.kind === "block") return "bg-zinc-300 text-zinc-700";
  if (c.status !== "confirmed") return "bg-amber-100 text-amber-900";
  if (c.kind === "external" || c.kind === "walkin") return c.paid ? "bg-sky-200 text-sky-900" : "bg-sky-100 text-sky-900";
  return c.paid ? "bg-yellow-200 text-yellow-900" : "bg-green-200 text-green-900";
}

/**
 * Excel-style month grid: slot times down the side, days across the top.
 * `href` (admin) makes every cell a link: booked cells open the booking,
 * free cells open "new booking" prefilled with that day and time.
 */
export default function MonthGridView(props: {
  grid: MonthGrid;
  basePath: string; // "/schedule" or "/admin"
  href?: (day: number, time: string, bookingId?: string) => string;
}) {
  const g = props.grid;
  const prev = shiftMonth(g.year, g.month, -1);
  const next = shiftMonth(g.year, g.month, 1);
  const isCurrent = g.today.y === g.year && g.today.m === g.month;
  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <Link className="rounded border px-2 py-1 text-sm" href={`${props.basePath}?month=${monthKey(prev.y, prev.m)}`}>
          ‹
        </Link>
        <h2 className="text-lg font-semibold">{monthLabel(g.year, g.month)}</h2>
        <Link className="rounded border px-2 py-1 text-sm" href={`${props.basePath}?month=${monthKey(next.y, next.m)}`}>
          ›
        </Link>
        <div className="ml-auto flex flex-wrap gap-3 text-xs text-zinc-600">
          <span><i className="mr-1 inline-block h-3 w-3 bg-green-200 align-middle" />Member, free hours</span>
          <span><i className="mr-1 inline-block h-3 w-3 bg-yellow-200 align-middle" />Member, paid</span>
          <span><i className="mr-1 inline-block h-3 w-3 bg-sky-200 align-middle" />External</span>
          <span><i className="mr-1 inline-block h-3 w-3 bg-amber-100 align-middle" />Pending</span>
          <span><i className="mr-1 inline-block h-3 w-3 bg-zinc-300 align-middle" />Blocked</span>
        </div>
      </div>
      <div className="overflow-auto rounded border border-zinc-300">
        <table className="min-w-max border-collapse text-[11px] leading-tight">
          <thead className="sticky top-0 z-10 bg-white">
            <tr>
              <th className="sticky left-0 z-20 border-b border-r border-zinc-300 bg-white px-2 py-1 text-left font-medium">
                Time
              </th>
              {Array.from({ length: g.days }, (_, i) => i + 1).map((d) => {
                const wd = g.weekdays[d - 1];
                const today = isCurrent && g.today.d === d;
                return (
                  <th
                    key={d}
                    className={
                      "border-b border-r border-zinc-300 px-1 py-1 text-center font-medium " +
                      (today ? "bg-zinc-900 text-white" : wd === 0 || wd === 6 ? "bg-zinc-100" : "")
                    }
                  >
                    <div>{d}</div>
                    <div className="text-[9px] opacity-70">{DOW[wd]}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {g.times.map((t) => (
              <tr key={t}>
                <td className="sticky left-0 z-10 whitespace-nowrap border-b border-r border-zinc-300 bg-white px-2 py-0.5 text-zinc-600">
                  {label12(t)}
                </td>
                {Array.from({ length: g.days }, (_, i) => i + 1).map((d) => {
                  const c = g.cells[`${d}|${t}`];
                  const wd = g.weekdays[d - 1];
                  const past = isCurrent ? d < g.today.d : g.year < g.today.y || (g.year === g.today.y && g.month < g.today.m);
                  const cls = "h-6 min-w-[64px] max-w-[96px] truncate border-b border-r border-zinc-200 px-1 align-middle " + cellClass(c, past, wd === 0 || wd === 6);
                  const content = c ? (c.isStart || true ? c.name : "") : "";
                  if (props.href) {
                    return (
                      <td key={d} className={cls + " p-0"}>
                        <Link href={props.href(d, t, c?.bookingId)} className="block h-6 truncate px-1 leading-6 hover:ring-1 hover:ring-inset hover:ring-zinc-900" title={c?.name}>
                          {content}
                        </Link>
                      </td>
                    );
                  }
                  return (
                    <td key={d} className={cls} title={c?.name}>
                      {content}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
