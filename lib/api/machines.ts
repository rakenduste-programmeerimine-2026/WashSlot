import { dbFail, fail, type ActionResult } from "@/lib/action-result";
import { getMyBuildingId } from "@/lib/building";
import { createClient } from "@/lib/supabase/server";
import type { Machine } from "@/lib/types";
import { isCycleMinutes, isMachineType, isUuid, toMachineLabel } from "@/lib/validation";

const LABEL_TAKEN = { "23505": "A machine with this label already exists." };

/** Admin only: adds a machine to the admin's building. RLS rejects non-admins. */
export async function addMachine(
  label: unknown,
  type: unknown,
  defaultCycleMinutes: unknown,
): Promise<ActionResult<Machine>> {
  const cleanLabel = toMachineLabel(label);
  if (!cleanLabel) return fail("Label must be 1–30 characters.");
  if (!isMachineType(type)) return fail('Type must be "washer" or "dryer".');
  if (!isCycleMinutes(defaultCycleMinutes)) {
    return fail("Default length must be a whole number between 5 and 240 minutes.");
  }

  const buildingId = await getMyBuildingId();
  if (!buildingId) return fail("Join a building first.", 403);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("machines")
    .insert({
      building_id: buildingId,
      label: cleanLabel,
      type,
      default_cycle_minutes: defaultCycleMinutes,
    })
    .select()
    .single();
  return error ? dbFail(error, LABEL_TAKEN) : { ok: true, data: data as Machine };
}

export type MachineChanges = {
  label?: unknown;
  type?: unknown;
  defaultCycleMinutes?: unknown;
  outOfOrder?: unknown;
};

/** Admin only: changes a machine's label, type, default length or out-of-order flag. */
export async function updateMachine(
  machineId: unknown,
  changes: MachineChanges,
): Promise<ActionResult<Machine>> {
  if (!isUuid(machineId)) return fail("Invalid machine.");

  const update: Partial<Omit<Machine, "id" | "building_id" | "created_at">> = {};
  if (changes.label !== undefined) {
    const label = toMachineLabel(changes.label);
    if (!label) return fail("Label must be 1–30 characters.");
    update.label = label;
  }
  if (changes.type !== undefined) {
    if (!isMachineType(changes.type)) return fail('Type must be "washer" or "dryer".');
    update.type = changes.type;
  }
  if (changes.defaultCycleMinutes !== undefined) {
    if (!isCycleMinutes(changes.defaultCycleMinutes)) {
      return fail("Default length must be a whole number between 5 and 240 minutes.");
    }
    update.default_cycle_minutes = changes.defaultCycleMinutes;
  }
  if (changes.outOfOrder !== undefined) {
    if (typeof changes.outOfOrder !== "boolean") return fail("outOfOrder must be true or false.");
    update.out_of_order = changes.outOfOrder;
  }
  if (Object.keys(update).length === 0) return fail("Nothing to change.");

  const supabase = await createClient();
  // RLS silently skips rows the user may not change, so check that one came back.
  const { data, error } = await supabase
    .from("machines")
    .update(update)
    .eq("id", machineId)
    .select()
    .maybeSingle();
  if (error) return dbFail(error, LABEL_TAKEN);
  if (!data) return fail("Not allowed or not found.", 404);
  return { ok: true, data: data as Machine };
}
