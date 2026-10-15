import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getSettings, getOffices } from "@/lib/settings";
import { fmtRange, inr, hoursBetween } from "@/lib/time";
import type { Booking, Person, Tenant } from "@/lib/types";
import Flash from "@/components/flash";
import { actConfirm, actReject, actCancel, actTogglePaid } from "../../actions";

export const dynamic = "force-dynamic";

export default async function RequestDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { data } = await db().from("bookings").select("*").eq("id", id).maybeSingle();
  const b = data as Booking | null;
  if (!b) notFound();
  const settings = await getSettings();
  const offices = await getOffices();
  let person: Person | null = null;
  if (b.person_id) {
    const { data: p } = await db().from("people").select("*").eq("id", b.person_id).maybeSingle();
    person = p as Person | null;
  }
  const { data: t } = await db().from("tenants").select("*").eq("active", true).order("name");
  const tenants = (t ?? []) as Tenant[];
  const tenant = tenants.find((x) => x.id === (b.tenant_id ?? person?.tenant_id)) ?? null;
  let usedThisMonth: number | null = null;
  if (tenant) {
    const { data: u } = await db().rpc("tenant_hours_used", { p_tenant: tenant.id, p_at: b.start_at, p_tz: settings.timezone });
    usedThisMonth = Number(u ?? 0);
  }
  const allowance = tenant ? (tenant.free_hours == null ? settings.default_free_hours : Number(tenant.free_hours)) : null;
  const pending = b.status === "pending_admin" || b.status === "pending_email";
  const officeCode = offices.find((o) => o.id === person?.office_id)?.code;
  const needsTenant = b.kind === "member" && !!person && !person.tenant_id;
  // suggest tenants in the same office, typed company first
  const suggested = tenants
    .filter((x) => !person?.office_id || x.office_id === person.office_id || x.office_id == null)
    .sort((a, c) => {
      const pc = (person?.company ?? "").toLowerCase();
      const am = pc && a.name.toLowerCase().includes(pc) ? -1 : 0;
      const cm = pc && c.name.toLowerCase().includes(pc) ? -1 : 0;
      return am - cm || a.name.localeCompare(c.name);
    });
  const hours = hoursBetween(new Date(b.start_at), new Date(b.end_at));
  const ret = `/admin/requests/${b.id}`;
  const input = "w-full rounded-md border border-zinc-300 px-3 py-2 text-sm";

  return (
    <div className="max-w-2xl">
      <Flash ok={sp.ok} err={sp.err} />
      <p className="text-sm">
        <Link href="/admin/requests" className="underline">
          ← Requests
        </Link>
      </p>
      <h1 className="mt-2 text-lg font-semibold">
        {b.display_name} · {fmtRange(settings.timezone, new Date(b.start_at), new Date(b.end_at))}
      </h1>
      <dl className="mt-3 grid grid-cols-[140px_1fr] gap-y-1 text-sm">
        <dt className="text-zinc-500">Status</dt>
        <dd>{b.status.replace("_", " ")}{b.decision_note ? ` (${b.decision_note})` : ""}</dd>
        <dt className="text-zinc-500">Type</dt>
        <dd>{b.kind}</dd>
        <dt className="text-zinc-500">Duration</dt>
        <dd>{hours} h</dd>
        {person && (
          <>
            <dt className="text-zinc-500">Booker</dt>
            <dd>
              {person.name} · {person.email} · {person.phone}
              <span className="ml-2 rounded bg-zinc-100 px-1.5 text-xs">{person.status}</span>
            </dd>
            <dt className="text-zinc-500">Office</dt>
            <dd>{officeCode ?? "–"}{person.company ? ` · typed company: ${person.company}` : ""}</dd>
          </>
        )}
        {!person && b.contact_email && (
          <>
            <dt className="text-zinc-500">Contact</dt>
            <dd>{b.contact_email} · {b.contact_phone}</dd>
          </>
        )}
        <dt className="text-zinc-500">Tenant</dt>
        <dd>
          {tenant ? (
            <>
              {tenant.name}
              {allowance != null && (
                <span className="text-zinc-500">
                  {" "}
                  · {usedThisMonth} of {allowance} free hours used this month
                </span>
              )}
            </>
          ) : b.kind === "member" ? (
            <span className="text-amber-800">not linked yet</span>
          ) : (
            "–"
          )}
        </dd>
        {b.status === "confirmed" && (
          <>
            <dt className="text-zinc-500">Charge</dt>
            <dd>
              {Number(b.free_hours)} h free, {Number(b.paid_hours)} h paid: <b>{inr(Number(b.charge))}</b>{" "}
              {Number(b.charge) > 0 && (
                <form action={actTogglePaid} className="inline">
                  <input type="hidden" name="id" value={b.id} />
                  <input type="hidden" name="return" value={ret} />
                  <input type="hidden" name="paid" value={b.paid ? "0" : "1"} />
                  <button className={"ml-2 rounded px-2 py-0.5 text-xs " + (b.paid ? "bg-green-200" : "bg-yellow-200")}>
                    {b.paid ? "Paid ✓ (mark unpaid)" : "Mark paid"}
                  </button>
                </form>
              )}
            </dd>
          </>
        )}
        {b.note && (
          <>
            <dt className="text-zinc-500">Note</dt>
            <dd>{b.note}</dd>
          </>
        )}
      </dl>

      {pending && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <form action={actConfirm} className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50 p-4">
            <input type="hidden" name="id" value={b.id} />
            <input type="hidden" name="return" value={ret} />
            <h2 className="font-medium">Confirm</h2>
            {needsTenant && (
              <>
                <label className="block text-xs text-zinc-600">Link {person?.name} to a tenant (the contract that holds the free hours)</label>
                <select name="tenant_id" className={input} defaultValue={suggested[0] && person?.company && suggested[0].name.toLowerCase().includes(person.company.toLowerCase()) ? suggested[0].id : "__new__"}>
                  <option value="__new__">+ Create new tenant</option>
                  {suggested.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                      {x.office_id ? ` (${offices.find((o) => o.id === x.office_id)?.code})` : ""}
                    </option>
                  ))}
                </select>
                <input name="new_tenant" placeholder="New tenant name (if creating)" defaultValue={person?.company ?? person?.name ?? ""} className={input} />
                <input type="hidden" name="office_id" value={person?.office_id ?? ""} />
              </>
            )}
            <button className="rounded bg-emerald-700 px-3 py-2 text-sm text-white">Confirm and allot</button>
          </form>
          <form action={actReject} className="space-y-2 rounded-md border border-red-200 bg-red-50 p-4">
            <input type="hidden" name="id" value={b.id} />
            <input type="hidden" name="return" value={ret} />
            <h2 className="font-medium">Reject</h2>
            <input name="reason" placeholder="Reason (optional, goes to the booker)" className={input} />
            <button className="rounded bg-red-700 px-3 py-2 text-sm text-white">Reject</button>
          </form>
        </div>
      )}
      {(b.status === "confirmed" || pending) && (
        <form action={actCancel} className="mt-6">
          <input type="hidden" name="id" value={b.id} />
          <input type="hidden" name="return" value={ret} />
          <button className="rounded border border-zinc-400 px-3 py-1.5 text-sm">Cancel this booking</button>
        </form>
      )}
    </div>
  );
}
