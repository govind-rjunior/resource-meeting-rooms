import { getSettings, getRoom } from "@/lib/settings";
import { monthGrid, parseMonth } from "@/lib/grid";
import MonthGridView from "@/components/month-grid";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const sp = await searchParams;
  const settings = await getSettings();
  const room = await getRoom();
  const { y, m } = parseMonth(sp.month, settings.timezone);
  const grid = await monthGrid(y, m, { showNames: settings.public_shows_names });
  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6">
      <header className="mb-4 flex flex-wrap items-baseline gap-x-4">
        <h1 className="text-xl font-semibold">{room.name} schedule</h1>
        <p className="text-sm text-zinc-600">{settings.space_name}</p>
        <Link href="/" className="ml-auto text-sm underline">
          Book a slot
        </Link>
      </header>
      <MonthGridView grid={grid} basePath="/schedule" />
      <p className="mt-3 text-xs text-zinc-500">Refreshes on every load. Pending requests hold their slot until the front desk decides.</p>
    </main>
  );
}
