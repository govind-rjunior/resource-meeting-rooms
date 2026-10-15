export type PersonStatus = "unverified" | "verified" | "active" | "blocked";
export type BookingStatus =
  | "pending_email"
  | "pending_admin"
  | "confirmed"
  | "rejected"
  | "expired"
  | "cancelled";
export type BookingKind = "member" | "external" | "walkin" | "block";

export interface Settings {
  id: number;
  open_time: string; // "09:00:00"
  close_time: string;
  slot_minutes: number;
  max_booking_minutes: number;
  member_horizon_days: number;
  external_horizon_days: number;
  weekend_open: boolean;
  default_free_hours: number;
  member_rate: number;
  external_rate: number;
  front_desk_email: string;
  cancel_cutoff_minutes: number;
  public_shows_names: boolean;
  approval_required: boolean;
  timezone: string;
  space_name: string;
}

export interface Room {
  id: number;
  name: string;
  capacity: number;
  active: boolean;
}

export interface Office {
  id: number;
  code: string;
  sort: number;
}

export interface Tenant {
  id: string;
  name: string;
  office_id: number | null;
  free_hours: number | null;
  notes: string | null;
  active: boolean;
  created_at: string;
}

export interface Person {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  company: string | null;
  office_id: number | null;
  tenant_id: string | null;
  is_external: boolean;
  status: PersonStatus;
  verify_token: string | null;
  created_at: string;
  verified_at: string | null;
  activated_at: string | null;
}

export interface Booking {
  id: string;
  room_id: number;
  person_id: string | null;
  tenant_id: string | null;
  kind: BookingKind;
  display_name: string;
  company: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  start_at: string;
  end_at: string;
  status: BookingStatus;
  free_hours: number;
  paid_hours: number;
  charge: number;
  paid: boolean;
  note: string | null;
  created_by: string;
  cancel_token: string | null;
  admin_token: string | null;
  created_at: string;
  decided_at: string | null;
  decision_note: string | null;
}

export const ACTIVE_STATUSES: BookingStatus[] = [
  "pending_email",
  "pending_admin",
  "confirmed",
];
