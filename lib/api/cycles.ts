import { dbFail, fail, type ActionResult } from "@/lib/action-result";
import { getSignedIn } from "@/lib/auth";
import { cancelCycleEndEmail, scheduleCycleEndEmail } from "@/lib/email";
import type { Cycle, ReleaseReason } from "@/lib/types";
import { isCycleMinutes, isUuid } from "@/lib/validation";

type SignedIn = NonNullable<Awaited<ReturnType<typeof getSignedIn>>>;

// An email problem must never stop someone starting or releasing a cycle, so errors are only logged.
async function emailOnFinish(auth: SignedIn, cycle: Cycle) {
  try {
    if (!auth.email) throw new Error("signed-in user has no email");
    const { data: machine, error } = await auth.supabase
      .from("machines")
      .select("label, buildings(timezone)")
      .eq("id", cycle.machine_id)
      .single();
    if (error) throw error;
    await scheduleCycleEndEmail({
      cycleId: cycle.id,
      to: auth.email,
      machineLabel: machine.label,
      endsAt: cycle.ends_at,
      timezone: (machine.buildings as unknown as { timezone: string }).timezone,
    });
  } catch (error) {
    console.error("Could not schedule the cycle-end email", error);
  }
}

/** Starts a machine and schedules the "laundry is done" email. Without `minutes`, the machine's default length is used. */
export async function startCycle(machineId: unknown, minutes?: unknown): Promise<ActionResult<Cycle>> {
  if (!isUuid(machineId)) return fail("Invalid machine.");
  if (minutes !== undefined && !isCycleMinutes(minutes)) {
    return fail("Minutes must be a whole number between 5 and 240.");
  }

  const auth = await getSignedIn();
  if (!auth) return fail("Not logged in.", 401);
  const { data, error } = await auth.supabase.rpc("start_cycle", {
    machine_id: machineId,
    minutes: minutes ?? null,
  });
  if (error) return dbFail(error);

  await emailOnFinish(auth, data as Cycle);
  return { ok: true, data: data as Cycle };
}

/** Marks your own cycle collected, or cancels it, and cancels its pending email. */
export async function releaseCycle(
  cycleId: unknown,
  reason: unknown = "collected",
): Promise<ActionResult<Cycle>> {
  if (!isUuid(cycleId)) return fail("Invalid cycle.");
  if (reason !== "collected" && reason !== "cancelled") {
    return fail('Reason must be "collected" or "cancelled".');
  }

  const auth = await getSignedIn();
  if (!auth) return fail("Not logged in.", 401);
  const { data, error } = await auth.supabase.rpc("release_cycle", {
    cycle_id: cycleId,
    reason: reason satisfies ReleaseReason,
  });
  if (error) return dbFail(error);

  await cancelCycleEndEmail(cycleId).catch((e) =>
    console.error("Could not cancel the cycle-end email", e),
  );
  return { ok: true, data: data as Cycle };
}
