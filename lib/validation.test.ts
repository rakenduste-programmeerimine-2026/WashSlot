import {
  isCycleMinutes,
  isMachineType,
  isUuid,
  toIsoTimestamp,
  toMachineLabel,
} from "@/lib/validation";
import { expect, test } from "vitest";

test("isUuid accepts UUIDs only", () => {
  expect(isUuid("00000000-0000-0000-0000-0000000000b1")).toBe(true);
  expect(isUuid("not-a-uuid")).toBe(false);
  expect(isUuid(42)).toBe(false);
});

test("isCycleMinutes allows whole minutes from 5 to 240", () => {
  expect(isCycleMinutes(5)).toBe(true);
  expect(isCycleMinutes(240)).toBe(true);
  for (const bad of [4, 241, 30.5, "60", null]) expect(isCycleMinutes(bad)).toBe(false);
});

test("toIsoTimestamp normalises valid dates and rejects the rest", () => {
  expect(toIsoTimestamp("2026-11-08T10:00:00+02:00")).toBe("2026-11-08T08:00:00.000Z");
  for (const bad of ["", "tomorrow", 123, null]) expect(toIsoTimestamp(bad)).toBeNull();
});

test("toMachineLabel trims and enforces 1-30 characters", () => {
  expect(toMachineLabel("  Washer 6 ")).toBe("Washer 6");
  expect(toMachineLabel("   ")).toBeNull();
  expect(toMachineLabel("x".repeat(31))).toBeNull();
});

test("isMachineType allows washer and dryer", () => {
  expect(isMachineType("washer")).toBe(true);
  expect(isMachineType("dryer")).toBe(true);
  expect(isMachineType("oven")).toBe(false);
});
