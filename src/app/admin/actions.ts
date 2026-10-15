"use server";

import { db } from "@/lib/db";
import { isAdmin } from "@/lib/admin-auth";
import { confirmBooking, rejectBooking, cancelBooking, adminCreateBooking, BookingError } from "@/lib/booking";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

async function guard() {
  if (!(await isAdmin())) throw new Error("Not signed in.");
}

function back(path: string, msg: string, ok = true): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}${ok ? "ok" : "err"}=${encodeURIComponent(msg)}`);
}

function errMsg(e: unknown): string {
  return e instanceof BookingError ? e.message : (e as Error).message || "Something went wrong.";
}

/** Create a tenant (optional) and confirm a request. */
export async function actConfirm(form: FormData) {
  await guard();
  const id = String(form.get("id"));
  const ret = String(form.get("return") || `/admin/requests/${id}`);
  let tenantId = String(form.get("tenant_id") || "") || null;
  const newTenant = String(form.get("new_tenant") || "").trim();
  const officeId = form.get("office_id") ? Number(form.get("office_id")) : null;
  try {
    if (tenantId === "__new__" || (!tenantId && newTenant)) {
      if (!newTenant) throw new BookingError("Give the new tenant a name.");
      const { data, error } = await db()
        .from("tenants")
        .insert({ name: newTenant, office_id: officeId })
        .select("id")
        .single();
      if (error) throw new BookingError(error.message.includes("duplicate") ? "A tenant with that name already exists in that office." : error.message);
      tenantId = data.id;
    }
    await confirmBooking(id, { tenantId: tenantId ?? undefined, note: String(form.get("note") || "") || undefined });
  } catch (e) {
    back(ret, errMsg(e), false);
  }
  revalidatePath("/admin");
  revalidatePath("/schedule");
  back(ret, "Confirmed. The booker has been emailed.");
}

export async function actReject(form: FormData) {
  await guard();
  const id = String(form.get("id"));
  const ret = String(form.get("return") || `/admin/requests/${id}`);
  try {
    await rejectBooking(id, String(form.get("reason") || "") || null);
  } catch (e) {
    back(ret, errMsg(e), false);
  }
  revalidatePath("/admin");
  revalidatePath("/schedule");
  back(ret, "Rejected. The booker has been emailed.");
}

export async function actCancel(form: FormData) {
  await guard();
  const id = String(form.get("id"));
  const ret = String(form.get("return") || `/admin/requests/${id}`);
  const r = await cancelBooking(id, "admin");
  revalidatePath("/admin");
  revalidatePath("/schedule");
  back(ret, r.message, r.ok);
}

export async function actTogglePaid(form: FormData) {
  await guard();
  const id = String(form.get("id"));
  const ret = String(form.get("return") || `/admin/requests/${id}`);
  const paid = String(form.get("paid")) === "1";
  await db().from("bookings").update({ paid }).eq("id", id);
  revalidatePath("/admin");
  back(ret, paid ? "Marked paid." : "Marked unpaid.");
}

export async function actCreateBooking(form: FormData) {
  await guard();
  const kind = String(form.get("kind")) as "walkin" | "block" | "member";
  try {
    const b = await adminCreateBooking({
      date: String(form.get("date")),
      time: String(form.get("time")),
      minutes: Number(form.get("minutes")),
      kind,
      name: String(form.get("name") || (kind === "block" ? "Blocked" : "")).trim(),
      company: String(form.get("company") || "").trim() || undefined,
      email: String(form.get("email") || "").trim() || undefined,
      phone: String(form.get("phone") || "").trim() || undefined,
      tenantId: String(form.get("tenant_id") || "") || null,
      note: String(form.get("note") || "").trim() || undefined,
      paid: form.get("paid") === "on",
    });
    revalidatePath("/admin");
    revalidatePath("/schedule");
    redirect(`/admin/requests/${b.id}?ok=${encodeURIComponent("Booking added.")}`);
  } catch (e) {
    if ((e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw e;
    back(`/admin/new?date=${form.get("date")}&time=${form.get("time")}`, errMsg(e), false);
  }
}

export async function actSaveTenant(form: FormData) {
  await guard();
  const id = String(form.get("id") || "");
  const payload = {
    name: String(form.get("name") || "").trim(),
    office_id: form.get("office_id") ? Number(form.get("office_id")) : null,
    free_hours: String(form.get("free_hours") || "").trim() === "" ? null : Number(form.get("free_hours")),
    notes: String(form.get("notes") || "").trim() || null,
    active: form.get("active") !== "off",
  };
  if (!payload.name) back("/admin/tenants", "Name is required.", false);
  const q = id ? db().from("tenants").update(payload).eq("id", id) : db().from("tenants").insert(payload);
  const { error } = await q;
  if (error) back("/admin/tenants", error.message, false);
  revalidatePath("/admin/tenants");
  back("/admin/tenants", "Saved.");
}

export async function actSavePerson(form: FormData) {
  await guard();
  const id = String(form.get("id"));
  const status = String(form.get("status"));
  const payload: Record<string, unknown> = {
    tenant_id: String(form.get("tenant_id") || "") || null,
    office_id: form.get("office_id") ? Number(form.get("office_id")) : null,
    name: String(form.get("name") || "").trim(),
  };
  if (["verified", "active", "blocked"].includes(status)) payload.status = status;
  if (status === "active" && !payload.tenant_id && form.get("is_external") !== "1")
    back("/admin/people", "An active member needs a tenant.", false);
  const { error } = await db().from("people").update(payload).eq("id", id);
  if (error) back("/admin/people", error.message, false);
  revalidatePath("/admin/people");
  back("/admin/people", "Saved.");
}

export async function actSaveSettings(form: FormData) {
  await guard();
  const num = (k: string) => Number(form.get(k));
  const payload = {
    open_time: String(form.get("open_time")),
    close_time: String(form.get("close_time")),
    slot_minutes: num("slot_minutes"),
    max_booking_minutes: num("max_booking_minutes"),
    member_horizon_days: num("member_horizon_days"),
    external_horizon_days: num("external_horizon_days"),
    weekend_open: form.get("weekend_open") === "on",
    default_free_hours: num("default_free_hours"),
    member_rate: num("member_rate"),
    external_rate: num("external_rate"),
    front_desk_email: String(form.get("front_desk_email")).trim(),
    cancel_cutoff_minutes: num("cancel_cutoff_minutes"),
    public_shows_names: form.get("public_shows_names") === "on",
    approval_required: form.get("approval_required") === "on",
    space_name: String(form.get("space_name")).trim(),
  };
  const { error } = await db().from("settings").update(payload).eq("id", 1);
  if (error) back("/admin/settings", error.message, false);
  const { error: e2 } = await db()
    .from("rooms")
    .update({ name: String(form.get("room_name")).trim(), capacity: num("room_capacity") })
    .eq("id", num("room_id"));
  if (e2) back("/admin/settings", e2.message, false);
  revalidatePath("/");
  revalidatePath("/schedule");
  back("/admin/settings", "Saved.");
}
