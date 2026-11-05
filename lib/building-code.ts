// Same format as the join_code check on public.buildings.
const BUILDING_CODE = /^[A-Z0-9]{6,12}$/;

export function normalizeBuildingCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const code = input.trim().toUpperCase();
  return BUILDING_CODE.test(code) ? code : null;
}
