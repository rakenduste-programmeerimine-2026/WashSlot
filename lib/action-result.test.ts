import { dbFail } from "@/lib/action-result";
import { expect, test, vi } from "vitest";

test("passes through messages the RPCs raise on purpose, with a status", () => {
  expect(dbFail({ code: "23P01", message: "machine is already in use" })).toEqual({
    ok: false,
    error: "Machine is already in use",
    status: 409,
  });
  expect(dbFail({ code: "P0002", message: "booking not found" })).toMatchObject({
    error: "Booking not found",
    status: 404,
  });
  expect(dbFail({ code: "22023", message: "minutes must be between 5 and 240" }).status).toBe(400);
});

test("uses an override message for a specific code", () => {
  expect(dbFail({ code: "23505", message: "duplicate key" }, { "23505": "Label taken" })).toEqual({
    ok: false,
    error: "Label taken",
    status: 409,
  });
});

test("hides unexpected database details", () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(dbFail({ code: "XX000", message: "relation secret_table" })).toEqual({
    ok: false,
    error: "Something went wrong. Please try again.",
    status: 500,
  });
  log.mockRestore();
});

test("maps auth and permission errors", () => {
  expect(dbFail({ code: "28000", message: "not authenticated" }).status).toBe(401);
  expect(dbFail({ code: "42501", message: "row-level security" })).toMatchObject({
    error: "Not allowed.",
    status: 403,
  });
});
