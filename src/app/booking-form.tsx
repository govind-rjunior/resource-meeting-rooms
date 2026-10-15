"use client";

import { useEffect, useMemo, useState } from "react";
import type { Office } from "@/lib/types";

interface Slot {
  time: string;
  startUtc: string;
  status: "free" | "booked" | "past" | "closed";
  label?: string;
}

function label12(t: string) {
  const [hh, mm] = t.split(":").map(Number);
  const h = hh % 12 === 0 ? 12 : hh % 12;
  return `${h}:${mm < 10 ? "0" + mm : mm} ${hh < 12 ? "am" : "pm"}`;
}

function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export default function BookingForm(props: {
  today: string;
  offices: Office[];
  slotMinutes: number;
  maxMinutes: number;
  memberHorizon: number;
  externalHorizon: number;
  approvalRequired: boolean;
}) {
  const [date, setDate] = useState(props.today);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);
  const [start, setStart] = useState<string | null>(null);
  const [minutes, setMinutes] = useState(60);
  const [isExternal, setIsExternal] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [officeId, setOfficeId] = useState<number | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const horizon = isExternal ? props.externalHorizon : props.memberHorizon;
  const maxDate = addDays(props.today, horizon);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setStart(null);
    fetch(`/api/slots?date=${date}`)
      .then((r) => r.json())
      .then((j) => {
        if (alive) setSlots(j.slots ?? []);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [date]);

  // How many consecutive free slots follow the chosen start (caps the duration picker)
  const maxFromStart = useMemo(() => {
    if (!start) return 0;
    const i = slots.findIndex((s) => s.time === start);
    if (i < 0) return 0;
    let n = 0;
    for (let j = i; j < slots.length && slots[j].status === "free"; j++) n++;
    return Math.min(n * props.slotMinutes, props.maxMinutes);
  }, [start, slots, props.slotMinutes, props.maxMinutes]);

  useEffect(() => {
    if (maxFromStart && minutes > maxFromStart) setMinutes(maxFromStart);
  }, [maxFromStart, minutes]);

  const durations: number[] = [];
  for (let m = props.slotMinutes; m <= props.maxMinutes; m += props.slotMinutes) durations.push(m);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!start) return setError("Pick a start time.");
    setSubmitting(true);
    try {
      const r = await fetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          time: start,
          minutes,
          isExternal,
          name,
          email,
          phone,
          company: company || undefined,
          officeId: isExternal ? null : officeId === "" ? null : officeId,
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        setError(j.error || "Something went wrong.");
        if (j.code === "clash") {
          const fresh = await fetch(`/api/slots?date=${date}`).then((x) => x.json());
          setSlots(fresh.slots ?? []);
          setStart(null);
        }
        return;
      }
      setDone(
        j.status === "pending_email"
          ? `Almost done. We sent a link to ${email}. Click it to send your request to the front desk.`
          : j.status === "confirmed"
            ? "Booked. A confirmation is on its way to your email."
            : "Request sent to the front desk. You will get an email when they confirm."
      );
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
        <p className="font-medium">{done}</p>
        <button className="mt-4 text-sm underline" onClick={() => location.reload()}>
          Make another request
        </button>
      </div>
    );
  }

  const inputCls =
    "w-full rounded-md border border-zinc-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-zinc-900/20";

  return (
    <form onSubmit={submit} className="space-y-6">
      <section>
        <label className="block text-sm font-medium">Date</label>
        <div className="mt-1 flex items-center gap-2">
          <input
            type="date"
            className={inputCls + " max-w-[200px]"}
            value={date}
            min={props.today}
            max={maxDate}
            onChange={(e) => setDate(e.target.value)}
            required
          />
          <span className="text-xs text-zinc-500">up to {horizon} days ahead</span>
        </div>
      </section>

      <section>
        <label className="block text-sm font-medium">Start time</label>
        {loading ? (
          <p className="mt-2 text-sm text-zinc-500">Loading…</p>
        ) : slots.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">No slots on this day.</p>
        ) : (
          <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6">
            {slots.map((s) => {
              const disabled = s.status !== "free";
              const active = start === s.time;
              return (
                <button
                  type="button"
                  key={s.time}
                  disabled={disabled}
                  onClick={() => setStart(s.time)}
                  title={s.label}
                  className={
                    "rounded-md border px-2 py-2 text-sm " +
                    (active
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : disabled
                        ? "cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-400 line-through"
                        : "border-zinc-300 bg-white hover:border-zinc-900")
                  }
                >
                  {label12(s.time)}
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <label className="block text-sm font-medium">Duration</label>
        <select
          className={inputCls + " mt-1 max-w-[200px]"}
          value={minutes}
          onChange={(e) => setMinutes(Number(e.target.value))}
          disabled={!start}
        >
          {durations.map((m) => (
            <option key={m} value={m} disabled={!!start && m > maxFromStart}>
              {m % 60 === 0 ? `${m / 60} hour${m === 60 ? "" : "s"}` : `${Math.floor(m / 60)}h ${m % 60}m`}
            </option>
          ))}
        </select>
        {start && maxFromStart < props.maxMinutes && (
          <p className="mt-1 text-xs text-zinc-500">
            The next booking starts after {maxFromStart / 60} hour{maxFromStart === 60 ? "" : "s"}.
          </p>
        )}
      </section>

      <section className="space-y-3 rounded-lg border border-zinc-200 p-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isExternal} onChange={(e) => setIsExternal(e.target.checked)} />
          I&apos;m not a member of {" "}
          <span className="font-medium">the workspace</span>
          <span className="text-zinc-500">(paid per hour, confirmed by the front desk)</span>
        </label>
        {!isExternal && (
          <div>
            <label className="block text-sm font-medium">Office</label>
            <select
              className={inputCls + " mt-1"}
              value={officeId}
              onChange={(e) => setOfficeId(e.target.value === "" ? "" : Number(e.target.value))}
              required={!isExternal}
            >
              <option value="">Pick your office</option>
              {props.offices.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.code}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium">Your name</label>
            <input className={inputCls + " mt-1"} value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm font-medium">Company {isExternal ? "" : "(as on your agreement)"}</label>
            <input className={inputCls + " mt-1"} value={company} onChange={(e) => setCompany(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium">Email</label>
            <input
              type="email"
              className={inputCls + " mt-1"}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <p className="mt-1 text-xs text-zinc-500">First time? You will get a link to confirm it.</p>
          </div>
          <div>
            <label className="block text-sm font-medium">Phone</label>
            <input type="tel" className={inputCls + " mt-1"} value={phone} onChange={(e) => setPhone(e.target.value)} required />
          </div>
        </div>
        <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      </section>

      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      <button
        type="submit"
        disabled={submitting || !start}
        className="w-full rounded-md bg-zinc-900 px-4 py-3 text-base font-medium text-white disabled:opacity-40 sm:w-auto"
      >
        {submitting ? "Sending…" : props.approvalRequired || isExternal ? "Send request" : "Book"}
      </button>
      <p className="text-xs text-zinc-500">
        {props.approvalRequired
          ? "Requests are confirmed by the front desk. The slot is held for you until they decide."
          : "Members are confirmed instantly."}
      </p>
    </form>
  );
}
