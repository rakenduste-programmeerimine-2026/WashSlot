// Read functions. RLS limits every query to the user's own building.
import { getSignedIn } from "@/lib/auth";
import type { Booking, Building, MachineStatus } from "@/lib/types";
import { redirect } from "next/navigation";

async function signedIn() {
  const auth = await getSignedIn();
  if (!auth) redirect("/auth/login");
  return auth;
}

function orThrow<T>(what: string, result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(`Could not load ${what}: ${result.error.message}`);
  return result.data;
}

export async function getMachineStatuses(): Promise<MachineStatus[]> {
  const { supabase } = await signedIn();
  const result = await supabase.from("machine_status").select("*").order("label");
  return orThrow("machines", result) ?? [];
}

export async function getMyBuilding(): Promise<Building | null> {
  const { supabase } = await signedIn();
  const result = await supabase.from("buildings").select("id, name, timezone").maybeSingle();
  return orThrow("building", result);
}

/** The user's bookings that haven't ended yet, soonest first. */
export async function getMyBookings(): Promise<Booking[]> {
  const { supabase, userId } = await signedIn();
  const result = await supabase
    .from("bookings")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "booked")
    .gt("ends_at", new Date().toISOString())
    .order("starts_at");
  return orThrow("bookings", result) ?? [];
}

export async function isAdmin(): Promise<boolean> {
  const { supabase, userId } = await signedIn();
  const result = await supabase
    .from("profiles")
    .select("role, building_id")
    .eq("id", userId)
    .maybeSingle();
  const profile = orThrow("profile", result);
  return profile?.role === "admin" && profile.building_id !== null;
}
