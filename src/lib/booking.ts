import { db } from "./db";
import { getSettings, getRoom, getOffices, appUrl } from "./settings";
import {
  localDateTimeToUtc,
  localDateStr,
  utcToLocal,
  minutesOf,
  timeFromMinutes,
  fmtRange,
  hoursBetween,
} from "./time";
import {
  sendMail,
  tplVerify,
  tplRequestReceived,
  tplAdminRequest,
  tplConfirmed,
  tplRejected,
  tplExpired,
  tplCancelled,
  tplImpersonationWarning,
  type BookingSummary,
} from "./email";
import type { Booking, Person, Settings, Room, Tenant } from "./types";

export class BookingError extends Error {
  constructor(
    message: string,
    public code: string = "invalid",
    public httpStatus: number = 400
  ) {
    super(message);
  }
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** An unverified request holds its slot this long; after that it expires and the slot frees. */
export const PENDING_EMAIL_MINUTES = 45;
/** Abuse throttles: new (unverified) people per hour across the site, and open requests per email. */
const MAX_NEW_PEOPLE_PER_HOUR = 30;
const MAX_OPEN_REQUESTS_PER_PERSON = 5;

// ---------------------------------------------------------------------
// Slots for a day
// ---------------------------------------------------------------------
export interface SlotInfo {
  time: string; // "09:30"
  startUtc: string;
  status: "free" | "booked" | "past" | "closed";
  label?: string; // name, only when the caller is allowed to see it
}

export async function slotsForDate(
  dateStr: string,
  opts: { showNames: boolean }
): Promise<{ slots: SlotInfo[]; settings: Settings; room: Room }> {
  const settings = await getSettings();
  const room = await getRoom();
  const tz = settings.timezone;
  const open = minutesOf(settings.open_time);
  const close = minutesOf(settings.close_time);
  const dayStart = localDateTimeToUtc(tz, dateStr, "00:00");
  const dayEnd = new Date(dayStart.getTime() + 36 * 3600000);
  const { data: rows } = await db()
    .from("bookings")
    .select("start_at,end_at,status,display_name,kind")
    .eq("room_id", room.id)
    .in("status", ["pending_email", "pending_admin", "confirmed"])
    .lt("start_at", dayEnd.toISOString())
    .gt("end_at", dayStart.toISOString());
  const bookings = (rows ?? []).map((b) => ({
    s: new Date(b.start_at).getTime(),
    e: new Date(b.end_at).getTime(),
    name: b.kind === "block" ? "Blocked" : b.status === "confirmed" ? b.display_name : `${b.display_name} (pending)`,
  }));
  const weekday = utcToLocal(tz, new Date(dayStart.getTime() + 12 * 3600000)).weekday;
  const closedDay = !settings.weekend_open && (weekday === 0 || weekday === 6);
  const now = Date.now();
  const slots: SlotInfo[] = [];
  for (let m = open; m + settings.slot_minutes <= close; m += settings.slot_minutes) {
    const t = timeFromMinutes(m);
    const start = localDateTimeToUtc(tz, dateStr, t);
    const end = new Date(start.getTime() + settings.slot_minutes * 60000);
    let status: SlotInfo["status"] = "free";
    let label: string | undefined;
    if (closedDay) status = "closed";
    else if (start.getTime() < now) status = "past";
    else {
      const hit = bookings.find((b) => b.s < end.getTime() && b.e > start.getTime());
      if (hit) {
        status = "booked";
        label = opts.showNames ? hit.name : "Booked";
      }
    }
    slots.push({ time: t, startUtc: start.toISOString(), status, label });
  }
  return { slots, settings, room };
}

// ---------------------------------------------------------------------
// Create a request from the public page
// ---------------------------------------------------------------------
export interface BookInput {
  date: string; // YYYY-MM-DD local
  time: string; // HH:MM local
  minutes: number;
  isExternal: boolean;
  name: string;
  email: string;
  phone: string;
  company?: string;
  officeId?: number | null;
}

export async function createRequest(input: BookInput): Promise<{ status: Booking["status"]; bookingId: string }> {
  const settings = await getSettings();
  const room = await getRoom();
  const tz = settings.timezone;

  // --- validate the slot
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !/^\d{2}:\d{2}$/.test(input.time))
    throw new BookingError("Bad date or time.");
  const start = localDateTimeToUtc(tz, input.date, input.time);
  const end = new Date(start.getTime() + input.minutes * 60000);
  if (isNaN(start.getTime())) throw new BookingError("Bad date or time.");
  if (input.minutes < settings.slot_minutes || input.minutes % settings.slot_minutes !== 0)
    throw new BookingError(`Duration must be in ${settings.slot_minutes}-minute steps.`);
  if (input.minutes > settings.max_booking_minutes)
    throw new BookingError(`Maximum booking is ${settings.max_booking_minutes / 60} hours.`);
  const startMin = minutesOf(input.time);
  if (startMin % settings.slot_minutes !== 0) throw new BookingError("Start time is not on a slot boundary.");
  if (startMin < minutesOf(settings.open_time) || startMin + input.minutes > minutesOf(settings.close_time))
    throw new BookingError(`The room is open ${settings.open_time.slice(0, 5)} to ${settings.close_time.slice(0, 5)}.`);
  if (start.getTime() < Date.now()) throw new BookingError("That time has already passed.");
  const wd = utcToLocal(tz, start).weekday;
  if (!settings.weekend_open && (wd === 0 || wd === 6)) throw new BookingError("The room is closed on weekends.");
  const horizon = input.isExternal ? settings.external_horizon_days : settings.member_horizon_days;
  if (start.getTime() > Date.now() + horizon * 86400000)
    throw new BookingError(`${input.isExternal ? "Non-members" : "Members"} can book up to ${horizon} days ahead.`);

  // --- validate the person
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim();
  if (name.length < 2) throw new BookingError("Please give your name.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new BookingError("That email address does not look right.");
  if (phone.replace(/\D/g, "").length < 8) throw new BookingError("Please give a phone number.");
  if (!input.isExternal && !input.officeId) throw new BookingError("Pick your office.");

  const { data: existing } = await db()
    .from("people")
    .select("*")
    .eq("email", email)
    .maybeSingle();
  let person = existing as Person | null;

  if (person?.status === "blocked") throw new BookingError("This email cannot book. Please contact the front desk.", "blocked", 403);

  // Impersonation guard: same office + same name already registered under a
  // different email. Refuse, and tell the registered person.
  if (!person && !input.isExternal && input.officeId) {
    const { data: clash } = await db()
      .from("people")
      .select("*")
      .eq("office_id", input.officeId)
      .in("status", ["verified", "active"]);
    const dup = (clash ?? []).find((p) => norm(p.name) === norm(name)) as Person | undefined;
    if (dup) {
      const offices = await getOffices();
      const office = offices.find((o) => o.id === input.officeId)?.code ?? "";
      await sendMail({
        to: dup.email,
        subject: "Someone tried to book the meeting room in your name",
        html: tplImpersonationWarning({
          name: dup.name,
          frontDesk: settings.front_desk_email,
          summary: {
            who: name,
            office,
            email,
            phone,
            when: fmtRange(tz, start, end),
            room: room.name,
            hours: hoursBetween(start, end),
            kind: "member",
          },
        }),
      });
      throw new BookingError(
        "This name is already registered in that office under a different email. Use your registered email, or ask the front desk.",
        "name_taken",
        409
      );
    }
  }

  if (!person) {
    const { count: recentNew } = await db()
      .from("people")
      .select("id", { count: "exact", head: true })
      .eq("status", "unverified")
      .gt("created_at", new Date(Date.now() - 3600000).toISOString());
    if ((recentNew ?? 0) >= MAX_NEW_PEOPLE_PER_HOUR)
      throw new BookingError("Too many new requests right now. Please try again in an hour or call the front desk.", "throttled", 429);
    const { data: created, error } = await db()
      .from("people")
      .insert({
        email,
        name,
        phone,
        company: input.company?.trim() || null,
        office_id: input.isExternal ? null : input.officeId,
        is_external: input.isExternal,
        status: "unverified",
      })
      .select("*")
      .single();
    if (error || !created) throw new BookingError("Could not save your details. Try again.", "db", 500);
    person = created as Person;
  } else {
    // keep contact details fresh, never change tenant/office from the public form
    await db().from("people").update({ phone, name: person.status === "active" ? person.name : name }).eq("id", person.id);
    if (person.is_external !== input.isExternal && person.status === "active") {
      throw new BookingError(
        person.is_external
          ? "This email is registered as a non-member. Tick 'I'm not a member', or ask the front desk to change it."
          : "This email is registered as a member. Untick 'I'm not a member'.",
        "kind_mismatch"
      );
    }
  }

  const { count: open } = await db()
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("person_id", person.id)
    .in("status", ["pending_email", "pending_admin"]);
  if ((open ?? 0) >= MAX_OPEN_REQUESTS_PER_PERSON)
    throw new BookingError(
      `You already have ${open} requests waiting. Wait for the front desk to decide, or cancel one from its email.`,
      "throttled",
      429
    );

  const verified = person.status === "verified" || person.status === "active";
  const needsAdmin = settings.approval_required || person.status !== "active" || input.isExternal;
  const status: Booking["status"] = !verified ? "pending_email" : needsAdmin ? "pending_admin" : "confirmed";

  // --- insert; the exclusion constraint decides clashes
  const { data: booking, error } = await db()
    .from("bookings")
    .insert({
      room_id: room.id,
      person_id: person.id,
      tenant_id: person.tenant_id,
      kind: input.isExternal ? "external" : "member",
      display_name: person.name,
      company: input.company?.trim() || person.company,
      contact_email: email,
      contact_phone: phone,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      status,
      created_by: "public",
    })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23P01") throw new BookingError("That slot was taken a moment ago. Pick another.", "clash", 409);
    throw new BookingError("Could not save the booking. Try again.", "db", 500);
  }
  const b = booking as Booking;

  if (status === "confirmed") {
    await finaliseConfirmation(b.id);
  } else if (status === "pending_email") {
    await sendMail({
      to: email,
      subject: "Confirm your email to request the meeting room",
      html: tplVerify({
        name: person.name,
        verifyUrl: `${appUrl()}/verify/${person.verify_token}`,
        summary: await summaryFor(b, settings, room),
      }),
    });
  } else {
    await notifyAdminOfRequest(b, person, settings, room);
    await sendMail({
      to: email,
      subject: "Request received: meeting room",
      html: tplRequestReceived({
        name: person.name,
        summary: await summaryFor(b, settings, room),
        cancelUrl: `${appUrl()}/cancel/${b.cancel_token}`,
      }),
    });
  }
  return { status, bookingId: b.id };
}

// ---------------------------------------------------------------------
// Email verification link
// ---------------------------------------------------------------------
export async function verifyPerson(token: string): Promise<{ ok: boolean; message: string }> {
  const { data: p } = await db().from("people").select("*").eq("verify_token", token).maybeSingle();
  const person = p as Person | null;
  if (!person) return { ok: false, message: "This link is not valid." };
  const settings = await getSettings();
  const room = await getRoom();
  if (person.status === "unverified") {
    await db()
      .from("people")
      .update({ status: "verified", verified_at: new Date().toISOString() })
      .eq("id", person.id);
    person.status = "verified";
  }
  // move any waiting bookings forward
  const { data: waiting } = await db()
    .from("bookings")
    .select("*")
    .eq("person_id", person.id)
    .eq("status", "pending_email")
    .gt("end_at", new Date().toISOString());
  let moved = 0;
  for (const raw of (waiting ?? []) as Booking[]) {
    const autoConfirm = !settings.approval_required && person.status === "active" && raw.kind === "member";
    await db()
      .from("bookings")
      .update({ status: autoConfirm ? "confirmed" : "pending_admin" })
      .eq("id", raw.id);
    if (autoConfirm) {
      await finaliseConfirmation(raw.id);
    } else {
      await notifyAdminOfRequest({ ...raw, status: "pending_admin" }, person, settings, room);
      await sendMail({
        to: person.email,
        subject: "Request received: meeting room",
        html: tplRequestReceived({
          name: person.name,
          summary: await summaryFor(raw, settings, room),
          cancelUrl: `${appUrl()}/cancel/${raw.cancel_token}`,
        }),
      });
    }
    moved++;
  }
  return {
    ok: true,
    message:
      moved > 0
        ? "Email confirmed. Your request is now with the front desk; you will get an email when they confirm."
        : "Email confirmed. There was no request waiting, so nothing else happened.",
  };
}

// ---------------------------------------------------------------------
// Admin decisions
// ---------------------------------------------------------------------
export async function confirmBooking(id: string, opts?: { tenantId?: string | null; note?: string }): Promise<Booking> {
  const { data: raw } = await db().from("bookings").select("*").eq("id", id).single();
  const b = raw as Booking | null;
  if (!b) throw new BookingError("Booking not found.", "not_found", 404);
  if (b.status !== "pending_admin" && b.status !== "pending_email")
    throw new BookingError(`This request is already ${b.status}.`, "state", 409);
  if (b.person_id) {
    const { data: p } = await db().from("people").select("*").eq("id", b.person_id).single();
    const person = p as Person;
    if (b.kind === "member") {
      const tenantId = opts?.tenantId ?? person.tenant_id;
      if (!tenantId) throw new BookingError("Pick a tenant for this person first.", "needs_tenant", 422);
      if (person.tenant_id !== tenantId || person.status !== "active") {
        await db()
          .from("people")
          .update({ tenant_id: tenantId, status: "active", activated_at: person.activated_at ?? new Date().toISOString() })
          .eq("id", person.id);
      }
      await db().from("bookings").update({ tenant_id: tenantId }).eq("id", id);
    } else if (person.status !== "active") {
      await db().from("people").update({ status: "active", activated_at: new Date().toISOString() }).eq("id", person.id);
    }
  }
  await db()
    .from("bookings")
    .update({ status: "confirmed", decided_at: new Date().toISOString(), decision_note: opts?.note ?? null })
    .eq("id", id);
  return finaliseConfirmation(id);
}

/** Compute quota/charge, store, email the booker. Booking must already be 'confirmed'. */
async function finaliseConfirmation(id: string): Promise<Booking> {
  const settings = await getSettings();
  const room = await getRoom();
  const { data: raw } = await db().from("bookings").select("*").eq("id", id).single();
  const b = raw as Booking;
  const start = new Date(b.start_at);
  const end = new Date(b.end_at);
  const hours = hoursBetween(start, end);
  let free = 0,
    paid = 0,
    charge = 0;
  if (b.kind === "external" || b.kind === "walkin") {
    paid = hours;
    charge = paid * settings.external_rate;
  } else if (b.kind === "member" && b.tenant_id) {
    const { data: t } = await db().from("tenants").select("*").eq("id", b.tenant_id).single();
    const tenant = t as Tenant;
    const allowance = tenant.free_hours == null ? settings.default_free_hours : Number(tenant.free_hours);
    const { data: usedRaw } = await db().rpc("tenant_hours_used", {
      p_tenant: b.tenant_id,
      p_at: b.start_at,
      p_tz: settings.timezone,
    });
    // this booking is already 'confirmed', so subtract itself from the sum
    const used = Math.max(0, Number(usedRaw ?? 0) - hours);
    free = Math.max(0, Math.min(hours, allowance - used));
    paid = Math.round((hours - free) * 100) / 100;
    charge = paid * settings.member_rate;
  }
  await db().from("bookings").update({ free_hours: free, paid_hours: paid, charge }).eq("id", id);
  const updated = { ...b, free_hours: free, paid_hours: paid, charge, status: "confirmed" as const };
  if (b.contact_email && b.kind !== "block") {
    await sendMail({
      to: b.contact_email,
      subject: `Room allotted: ${fmtRange(settings.timezone, start, end)}`,
      html: tplConfirmed({
        name: b.display_name,
        summary: await summaryFor(updated, settings, room),
        cancelUrl: `${appUrl()}/cancel/${b.cancel_token}`,
        cutoffMinutes: settings.cancel_cutoff_minutes,
      }),
      replyTo: settings.front_desk_email,
    });
  }
  return updated;
}

export async function rejectBooking(id: string, reason?: string | null): Promise<void> {
  const { data: raw } = await db().from("bookings").select("*").eq("id", id).single();
  const b = raw as Booking | null;
  if (!b) throw new BookingError("Booking not found.", "not_found", 404);
  if (b.status !== "pending_admin" && b.status !== "pending_email")
    throw new BookingError(`This request is already ${b.status}.`, "state", 409);
  await db()
    .from("bookings")
    .update({ status: "rejected", decided_at: new Date().toISOString(), decision_note: reason ?? null })
    .eq("id", id);
  if (b.contact_email) {
    const settings = await getSettings();
    const room = await getRoom();
    await sendMail({
      to: b.contact_email,
      subject: "Meeting room request not confirmed",
      html: tplRejected({ name: b.display_name, summary: await summaryFor(b, settings, room), reason }),
      replyTo: settings.front_desk_email,
    });
  }
}

export async function cancelBooking(
  id: string,
  by: "member" | "admin"
): Promise<{ ok: boolean; message: string }> {
  const { data: raw } = await db().from("bookings").select("*").eq("id", id).single();
  const b = raw as Booking | null;
  if (!b) return { ok: false, message: "Booking not found." };
  if (!["pending_email", "pending_admin", "confirmed"].includes(b.status))
    return { ok: false, message: `This booking is already ${b.status}.` };
  const settings = await getSettings();
  const cutoff = new Date(b.start_at).getTime() - settings.cancel_cutoff_minutes * 60000;
  if (by === "member" && Date.now() > cutoff)
    return {
      ok: false,
      message: `Too late to cancel online (cut-off is ${settings.cancel_cutoff_minutes} minutes before the start). Please call the front desk.`,
    };
  await db()
    .from("bookings")
    .update({ status: "cancelled", decided_at: new Date().toISOString(), decision_note: by === "admin" ? "cancelled by admin" : "cancelled by booker" })
    .eq("id", id);
  if (b.contact_email && b.kind !== "block") {
    const room = await getRoom();
    await sendMail({
      to: by === "admin" ? b.contact_email : [b.contact_email, settings.front_desk_email],
      subject: "Meeting room booking cancelled",
      html: tplCancelled({ name: b.display_name, summary: await summaryFor(b, settings, room), byAdmin: by === "admin" }),
    });
  }
  return { ok: true, message: "Cancelled. The slot is free again." };
}

/** Vercel cron: expire requests nobody decided on, and stale email verifications. */
export async function expireStale(): Promise<{ expired: number }> {
  const now = new Date().toISOString();
  const settings = await getSettings();
  const room = await getRoom();
  const { data: rows } = await db()
    .from("bookings")
    .select("*")
    .eq("status", "pending_admin")
    .lt("start_at", now);
  const { data: stale } = await db()
    .from("bookings")
    .select("*")
    .eq("status", "pending_email")
    .lt("created_at", new Date(Date.now() - PENDING_EMAIL_MINUTES * 60000).toISOString());
  const all = [...((rows ?? []) as Booking[]), ...((stale ?? []) as Booking[])];
  for (const b of all) {
    await db().from("bookings").update({ status: "expired", decided_at: now }).eq("id", b.id);
    if (b.status === "pending_admin" && b.contact_email) {
      await sendMail({
        to: [b.contact_email, settings.front_desk_email],
        subject: "Meeting room request expired",
        html: tplExpired({ name: b.display_name, summary: await summaryFor(b, settings, room) }),
      });
    }
  }
  return { expired: all.length };
}

// ---------------------------------------------------------------------
// Admin-created bookings (walk-in, block, or on behalf of a member)
// ---------------------------------------------------------------------
export async function adminCreateBooking(input: {
  date: string;
  time: string;
  minutes: number;
  kind: "walkin" | "block" | "member";
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  tenantId?: string | null;
  note?: string;
  paid?: boolean;
}): Promise<Booking> {
  const settings = await getSettings();
  const room = await getRoom();
  const start = localDateTimeToUtc(settings.timezone, input.date, input.time);
  const end = new Date(start.getTime() + input.minutes * 60000);
  if (isNaN(start.getTime()) || input.minutes <= 0) throw new BookingError("Bad date, time or duration.");
  const { data, error } = await db()
    .from("bookings")
    .insert({
      room_id: room.id,
      kind: input.kind,
      tenant_id: input.kind === "member" ? input.tenantId ?? null : null,
      display_name: input.kind === "block" ? input.name || "Blocked" : input.name,
      company: input.company || null,
      contact_email: input.email?.trim().toLowerCase() || null,
      contact_phone: input.phone || null,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      status: "confirmed",
      created_by: "admin",
      note: input.note || null,
      paid: !!input.paid,
      decided_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23P01") throw new BookingError("That time overlaps an existing booking.", "clash", 409);
    throw new BookingError(error.message, "db", 500);
  }
  const b = data as Booking;
  if (b.kind === "block") return b;
  return finaliseConfirmation(b.id);
}

// ---------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------
async function notifyAdminOfRequest(b: Booking, person: Person, settings: Settings, room: Room) {
  const base = appUrl();
  await sendMail({
    to: settings.front_desk_email,
    subject: `Room request: ${b.display_name}, ${fmtRange(settings.timezone, new Date(b.start_at), new Date(b.end_at))}`,
    html: tplAdminRequest({
      summary: await summaryFor(b, settings, room),
      confirmUrl: `${base}/act/${b.admin_token}?do=confirm`,
      rejectUrl: `${base}/act/${b.admin_token}?do=reject`,
      adminUrl: `${base}/admin/requests/${b.id}`,
      newPerson: person.status !== "active",
      typedCompany: person.company,
    }),
    replyTo: person.email,
  });
}

export async function summaryFor(b: Booking, settings: Settings, room: Room): Promise<BookingSummary> {
  let office: string | null = null;
  if (b.person_id) {
    const { data: p } = await db().from("people").select("office_id").eq("id", b.person_id).maybeSingle();
    if (p?.office_id) {
      const offices = await getOffices();
      office = offices.find((o) => o.id === p.office_id)?.code ?? null;
    }
  }
  const start = new Date(b.start_at);
  const end = new Date(b.end_at);
  return {
    who: b.display_name,
    company: b.company,
    office,
    email: b.contact_email,
    phone: b.contact_phone,
    when: fmtRange(settings.timezone, start, end),
    room: room.name,
    hours: hoursBetween(start, end),
    freeHours: Number(b.free_hours),
    paidHours: Number(b.paid_hours),
    charge: Number(b.charge),
    kind: b.kind,
  };
}

export function todayLocal(tz: string): string {
  return localDateStr(tz, new Date());
}
