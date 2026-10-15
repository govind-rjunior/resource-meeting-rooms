import { db } from "@/lib/db";
import { confirmBooking, rejectBooking, BookingError } from "@/lib/booking";
import { getSettings } from "@/lib/settings";
import { fmtRange } from "@/lib/time";
import type { Booking, Person } from "@/lib/types";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// One-click Confirm / Reject from the front-desk email. The admin_token in
// the URL is the credential. GET shows a confirmation button (so email
// scanners that prefetch links cannot act); POST performs the action.
export default async function ActPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ do?: string; msg?: string; ok?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const action = sp.do === "reject" ? "reject" : "confirm";
  const { data } = await db().from("bookings").select("*").eq("admin_token", token).maybeSingle();
  const b = data as Booking | null;
  const settings = await getSettings();
  let person: Person | null = null;
  if (b?.person_id) {
    const { data: p } = await db().from("people").select("*").eq("id", b.person_id).maybeSingle();
    person = p as Person | null;
  }
  const needsTenant = !!b && b.kind === "member" && !!person && !person.tenant_id;

  async function act(form: FormData) {
    "use server";
    if (!b) return;
    const what = String(form.get("do"));
    try {
      if (what === "confirm") await confirmBooking(b.id);
      else await rejectBooking(b.id, String(form.get("reason") || "") || null);
      revalidatePath("/schedule");
      redirect(`/act/${token}?ok=1&msg=${encodeURIComponent(what === "confirm" ? "Confirmed. The booker has been emailed." : "Rejected. The booker has been emailed and the slot released.")}`);
    } catch (e) {
      if (e instanceof BookingError) redirect(`/act/${token}?ok=0&msg=${encodeURIComponent(e.message)}`);
      throw e;
    }
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <h1 className="text-xl font-semibold">{action === "confirm" ? "Confirm request" : "Reject request"}</h1>
      {!b ? (
        <p className="mt-3">This link is not valid.</p>
      ) : sp.msg ? (
        <p className={"mt-3 " + (sp.ok === "1" ? "text-emerald-800" : "text-red-800")}>{decodeURIComponent(sp.msg)}</p>
      ) : b.status !== "pending_admin" && b.status !== "pending_email" ? (
        <p className="mt-3">This request is already {b.status.replace("_", " ")}.</p>
      ) : (
        <>
          <p className="mt-3 text-zinc-700">
            <b>{b.display_name}</b>
            {b.company ? ` (${b.company})` : ""}, {fmtRange(settings.timezone, new Date(b.start_at), new Date(b.end_at))}.
            {b.kind === "external" ? " External booking." : ""}
          </p>
          {needsTenant && action === "confirm" ? (
            <div className="mt-4 rounded-md bg-amber-50 p-4 text-sm text-amber-900">
              New booker: they are not yet linked to a tenant, so the free-hour quota cannot be applied. Open the request in
              the admin page to pick or create the tenant, then confirm there.
              <p className="mt-3">
                <Link href={`/admin/requests/${b.id}`} className="rounded bg-zinc-900 px-3 py-2 text-white">
                  Open in admin
                </Link>
              </p>
            </div>
          ) : (
            <form action={act} className="mt-6 space-y-3">
              <input type="hidden" name="do" value={action} />
              {action === "reject" && (
                <input name="reason" placeholder="Reason (optional, goes to the booker)" className="w-full rounded-md border border-zinc-300 px-3 py-2" />
              )}
              <button className={"rounded-md px-4 py-2 text-white " + (action === "confirm" ? "bg-emerald-700" : "bg-red-700")}>
                {action === "confirm" ? "Yes, confirm and allot the room" : "Yes, reject"}
              </button>
            </form>
          )}
        </>
      )}
      <p className="mt-8 text-sm">
        <Link href="/admin" className="underline">
          Admin page
        </Link>
      </p>
    </main>
  );
}
