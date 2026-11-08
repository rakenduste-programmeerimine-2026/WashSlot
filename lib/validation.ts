// Input checks for Server Actions. Limits mirror the database constraints.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

export function isCycleMinutes(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 5 && (value as number) <= 240;
}

/** Returns the timestamp as an ISO string, or null if it isn't a valid date. */
export function toIsoTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Returns the trimmed label, or null if it isn't 1–30 characters. */
export function toMachineLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const label = value.trim();
  return label.length >= 1 && label.length <= 30 ? label : null;
}

export function isMachineType(value: unknown): value is "washer" | "dryer" {
  return value === "washer" || value === "dryer";
}
