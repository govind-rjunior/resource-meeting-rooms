import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createRequest, BookingError } from "@/lib/booking";

export const dynamic = "force-dynamic";

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  minutes: z.number().int().min(15).max(24 * 60),
  isExternal: z.boolean(),
  name: z.string().min(1).max(120),
  email: z.string().min(3).max(200),
  phone: z.string().min(1).max(40),
  company: z.string().max(120).optional(),
  officeId: z.number().int().nullable().optional(),
  website: z.string().optional(), // honeypot
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Please fill in every field." }, { status: 400 });
  if (parsed.data.website) return NextResponse.json({ ok: true, status: "pending_email" }); // bot
  try {
    const result = await createRequest(parsed.data);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof BookingError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: e.httpStatus });
    }
    console.error(e);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
