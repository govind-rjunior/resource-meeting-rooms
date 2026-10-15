import { db } from "@/lib/db";
import { cancelBooking } from "@/lib/booking";
import { getSettings } from "@/lib/settings";
import { fmtRange } from "@/lib/time";
import type { Booking } from "@/lib/types";
import Link from "next/link";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

export default async function CancelPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ done?: string; msg?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const { data } = await db().from("bookings").select("*").eq("cancel_token", token).maybeSingle();
  const b = data as Booking | null;
  const settings = await getSettings();

  async function doCancel() {
    "use server";
    if (!b) return;
    const r = await cancelBooking(b.id, "member");
    revalidatePath("/schedule");
    const { redirect } = await import("next/navigation");
    redirect(`/cancel/${token}?done=${r.ok ? 1 : 0}&msg=${encodeURIComponent(r.message)}`);
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <h1 className="text-xl font-semibold">Cancel booking</h1>
      {!b ? (
        <p className="mt-3 text-zinc-700">This link is not valid.</p>
      ) : sp.msg ? (
        <p className={"mt-3 " + (sp.done === "1" ? "text-emerald-800" : "text-red-800")}>{decodeURIComponent(sp.msg)}</p>
      ) : (
        <>
          <p className="mt-3 text-zinc-700">
            {b.display_name}, {fmtRange(settings.timezone, new Date(b.start_at), new Date(b.end_at))}. Status: {b.status.replace("_", " ")}.
          </p>
          {["pending_email", "pending_admin", "confirmed"].includes(b.status) ? (
            <form action={doCancel} className="mt-6">
              <button className="rounded-md bg-red-700 px-4 py-2 text-white">Yes, cancel this booking</button>
            </form>
          ) : (
            <p className="mt-3 text-sm text-zinc-500">Nothing to cancel.</p>
          )}
        </>
      )}
      <p className="mt-8 text-sm">
        <Link href="/" className="underline">
          Back to booking
        </Link>
      </p>
    </main>
  );
}
