import { db } from "@/lib/db";
import { getSettings, getOffices } from "@/lib/settings";
import type { Tenant } from "@/lib/types";
import Flash from "@/components/flash";
import { actSaveTenant } from "../actions";

export const dynamic = "force-dynamic";

export default async function TenantsPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const settings = await getSettings();
  const offices = await getOffices();
  const { data } = await db().from("tenants").select("*").order("active", { ascending: false }).order("name");
  const tenants = (data ?? []) as Tenant[];
  const now = new Date().toISOString();
  const used = new Map<string, number>();
  for (const t of tenants) {
    const { data: u } = await db().rpc("tenant_hours_used", { p_tenant: t.id, p_at: now, p_tz: settings.timezone });
    used.set(t.id, Number(u ?? 0));
  }
  const { data: ppl } = await db().from("people").select("tenant_id");
  const headcount = new Map<string, number>();
  for (const p of ppl ?? []) if (p.tenant_id) headcount.set(p.tenant_id, (headcount.get(p.tenant_id) ?? 0) + 1);
  const input = "rounded-md border border-zinc-300 px-2 py-1 text-sm";
  return (
    <div>
      <Flash ok={sp.ok} err={sp.err} />
      <h1 className="text-lg font-semibold">Tenants</h1>
      <p className="mt-1 text-sm text-zinc-600">
        One row per contract. Free hours blank = the default ({settings.default_free_hours} h a month). Tenants are
        created when you confirm a new booker, or here.
      </p>
      <form action={actSaveTenant} className="mt-4 flex flex-wrap items-end gap-2 rounded-md border border-zinc-200 bg-white p-3">
        <label className="text-xs">
          New tenant
          <br />
          <input name="name" placeholder="Name" className={input} required />
        </label>
        <label className="text-xs">
          Office
          <br />
          <select name="office_id" className={input} defaultValue="">
            <option value="">–</option>
            {offices.map((o) => (
              <option key={o.id} value={o.id}>
                {o.code}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          Free hours
          <br />
          <input name="free_hours" type="number" step="0.5" min="0" placeholder={String(settings.default_free_hours)} className={input + " w-24"} />
        </label>
        <button className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white">Add</button>
      </form>
      <table className="mt-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-zinc-500">
            <th className="py-1">Tenant</th>
            <th>Office</th>
            <th>People</th>
            <th>Free hours</th>
            <th>Used this month</th>
            <th>Notes</th>
            <th>Active</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {tenants.map((t) => (
            <tr key={t.id} className="border-b border-zinc-100">
              <td colSpan={8} className="p-0">
                <form action={actSaveTenant} className="grid grid-cols-[1.5fr_0.7fr_0.5fr_0.7fr_0.8fr_1.5fr_0.5fr_0.5fr] items-center gap-2 py-1">
                  <input type="hidden" name="id" value={t.id} />
                  <input name="name" defaultValue={t.name} className={input} />
                  <select name="office_id" defaultValue={t.office_id ?? ""} className={input}>
                    <option value="">–</option>
                    {offices.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.code}
                      </option>
                    ))}
                  </select>
                  <span>{headcount.get(t.id) ?? 0}</span>
                  <input name="free_hours" type="number" step="0.5" min="0" defaultValue={t.free_hours ?? ""} placeholder={String(settings.default_free_hours)} className={input} />
                  <span>{used.get(t.id)} h</span>
                  <input name="notes" defaultValue={t.notes ?? ""} className={input} />
                  <select name="active" defaultValue={t.active ? "on" : "off"} className={input}>
                    <option value="on">yes</option>
                    <option value="off">no</option>
                  </select>
                  <button className="rounded border border-zinc-400 px-2 py-1 text-xs">Save</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
