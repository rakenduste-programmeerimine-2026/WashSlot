import { dbFail, fail, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";
import type { Cycle, ReleaseReason } from "@/lib/types";
import { isCycleMinutes, isUuid } from "@/lib/validation";

/** Starts a machine. Without `minutes`, the machine's default cycle length is used. */
export async function startCycle(machineId: unknown, minutes?: unknown): Promise<ActionResult<Cycle>> {
  if (!isUuid(machineId)) return fail("Invalid machine.");
  if (minutes !== undefined && !isCycleMinutes(minutes)) {
    return fail("Minutes must be a whole number between 5 and 240.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_cycle", {
    machine_id: machineId,
    minutes: minutes ?? null,
  });
  return error ? dbFail(error) : { ok: true, data: data as Cycle };
}

/** Marks your own cycle collected, or cancels it. */
export async function releaseCycle(
  cycleId: unknown,
  reason: unknown = "collected",
): Promise<ActionResult<Cycle>> {
  if (!isUuid(cycleId)) return fail("Invalid cycle.");
  if (reason !== "collected" && reason !== "cancelled") {
    return fail('Reason must be "collected" or "cancelled".');
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("release_cycle", {
    cycle_id: cycleId,
    reason: reason satisfies ReleaseReason,
  });
  return error ? dbFail(error) : { ok: true, data: data as Cycle };
}
