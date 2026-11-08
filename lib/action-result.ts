export type Failure = { ok: false; error: string; status: number };
export type ActionResult<T> = { ok: true; data: T } | Failure;

export const fail = (error: string, status = 400): Failure => ({ ok: false, error, status });

type DbError = { code?: string; message: string };

// Codes the RPCs raise on purpose. Their messages are written for users.
const USER_FACING: Record<string, number> = { P0001: 409, P0002: 404, "23P01": 409, "22023": 400 };

/** Turns a database error into a message and HTTP status that are safe to show in the browser. */
export function dbFail(error: DbError, overrides: Record<string, string> = {}): Failure {
  const code = error.code ?? "";
  if (overrides[code]) return fail(overrides[code], USER_FACING[code] ?? 409);
  if (code in USER_FACING) {
    return fail(error.message.charAt(0).toUpperCase() + error.message.slice(1), USER_FACING[code]);
  }
  if (code === "28000") return fail("Please log in again.", 401);
  if (code === "42501") return fail("Not allowed.", 403);
  console.error("Unexpected database error", error);
  return fail("Something went wrong. Please try again.", 500);
}
