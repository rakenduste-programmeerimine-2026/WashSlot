import { dbFail, fail, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";
import type { Booking } from "@/lib/types";
import { isUuid, toIsoTimestamp } from "@/lib/validation";

/** Books a machine. Times are ISO strings; the database enforces the booking rules. */
export async function createBooking(
  machineId: unknown,
  startsAt: unknown,
  endsAt: unknown,
): Promise<ActionResult<Booking>> {
  if (!isUuid(machineId)) return fail("Invalid machine.");
  const start = toIsoTimestamp(startsAt);
  const end = toIsoTimestamp(endsAt);
  if (!start || !end) return fail("Invalid start or end time.");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_booking", {
    machine_id: machineId,
    starts_at: start,
    ends_at: end,
  });
  return error ? dbFail(error) : { ok: true, data: data as Booking };
}

export async function cancelBooking(bookingId: unknown): Promise<ActionResult<Booking>> {
  if (!isUuid(bookingId)) return fail("Invalid booking.");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_booking", { booking_id: bookingId });
  return error ? dbFail(error) : { ok: true, data: data as Booking };
}
