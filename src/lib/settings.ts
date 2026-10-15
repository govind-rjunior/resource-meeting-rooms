import { db } from "./db";
import type { Settings, Room, Office } from "./types";

export async function getSettings(): Promise<Settings> {
  const { data, error } = await db().from("settings").select("*").eq("id", 1).single();
  if (error || !data) throw new Error("Settings row missing. Run supabase/schema.sql.");
  return {
    ...data,
    default_free_hours: Number(data.default_free_hours),
    member_rate: Number(data.member_rate),
    external_rate: Number(data.external_rate),
  } as Settings;
}

export async function getRoom(): Promise<Room> {
  const { data, error } = await db()
    .from("rooms")
    .select("*")
    .eq("active", true)
    .order("sort")
    .limit(1)
    .single();
  if (error || !data) throw new Error("No active room. Run supabase/schema.sql.");
  return data as Room;
}

export async function getOffices(): Promise<Office[]> {
  const { data } = await db().from("offices").select("*").order("sort");
  return (data ?? []) as Office[];
}

export function appUrl(): string {
  const u = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (u) return u.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
