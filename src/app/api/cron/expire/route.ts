import { NextRequest, NextResponse } from "next/server";
import { expireStale } from "@/lib/booking";

export const dynamic = "force-dynamic";

// Called by Vercel Cron (see vercel.json) once a day at 08:00 IST, the most
// the Hobby plan allows (Pro can run it every 15 minutes: change the schedule
// in vercel.json). Expiry also runs lazily whenever the admin page or the
// slot list loads, so the cron is a backstop and the keep-alive ping that
// stops Supabase's free tier pausing the project.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const r = await expireStale();
    return NextResponse.json({ ok: true, ...r, at: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
