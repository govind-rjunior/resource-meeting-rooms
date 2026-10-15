import { db } from "@/lib/db";
import { getOffices } from "@/lib/settings";
import type { Person, Tenant } from "@/lib/types";
import Flash from "@/components/flash";
import { actSavePerson } from "../actions";

export const dynamic = "force-dynamic";

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const offices = await getOffices();
  const { data: t } = await db().from("tenants").select("*").eq("active", true).order("name");
  const tenants = (t ?? []) as Tenant[];
  const { data } = await db().from("people").select("*").order("created_at", { ascending: false });
  const people = (data ?? []) as Person[];
  const input = "rounded-md border border-zinc-300 px-2 py-1 text-sm";
  const order: Record<string, number> = { verified: 0, unverified: 1, active: 2, blocked: 3 };
  people.sort((a, b) => order[a.status] - order[b.status]);
  return (
    <div>
      <Flash ok={sp.ok} err={sp.err} />
      <h1 className="text-lg font-semibold">People</h1>
      <p className="mt-1 text-sm text-zinc-600">
        The register that builds itself: one row per verified email. <b>verified</b> = clicked their email link, not yet
        linked to a tenant (confirming their first request does that). <b>active</b> = linked. <b>blocked</b> cannot book.
      </p>
      <table className="mt-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-zinc-500">
            <th className="py-1">Name</th>
            <th>Email · phone</th>
            <th>Office</th>
            <th>Tenant</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {people.map((p) => (
            <tr key={p.id} className="border-b border-zinc-100">
              <td colSpan={6} className="p-0">
                <form action={actSavePerson} className="grid grid-cols-[1.2fr_1.6fr_0.7fr_1.2fr_0.8fr_0.4fr] items-center gap-2 py-1">
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="is_external" value={p.is_external ? "1" : "0"} />
                  <input name="name" defaultValue={p.name} className={input} />
                  <span className="truncate text-xs text-zinc-600">
                    {p.email} · {p.phone}
                    {p.is_external ? " · external" : ""}
                    {p.company ? ` · typed: ${p.company}` : ""}
                  </span>
                  <select name="office_id" defaultValue={p.office_id ?? ""} className={input}>
                    <option value="">–</option>
                    {offices.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.code}
                      </option>
                    ))}
                  </select>
                  <select name="tenant_id" defaultValue={p.tenant_id ?? ""} className={input}>
                    <option value="">–</option>
                    {tenants.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                  <select name="status" defaultValue={p.status} className={input}>
                    <option value="unverified" disabled>
                      unverified
                    </option>
                    <option value="verified">verified</option>
                    <option value="active">active</option>
                    <option value="blocked">blocked</option>
                  </select>
                  <button className="rounded border border-zinc-400 px-2 py-1 text-xs">Save</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {people.length === 0 && <p className="mt-3 text-sm text-zinc-500">Nobody has booked yet.</p>}
    </div>
  );
}
