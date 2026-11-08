// Helpers shared by the /api route handlers.
import type { ActionResult } from "@/lib/action-result";
import { getSignedIn } from "@/lib/auth";
import { unstable_rethrow } from "next/navigation";
import { NextResponse } from "next/server";

export const errorResponse = (error: string, status: number) =>
  NextResponse.json({ error }, { status });

export function toResponse<T>(result: ActionResult<T>, okStatus = 200) {
  return result.ok
    ? NextResponse.json(result.data, { status: okStatus })
    : errorResponse(result.error, result.status);
}

/**
 * Reads a JSON object body. Requiring `application/json` also stops cross-site
 * HTML forms from posting with the user's cookie.
 */
export async function readJson(
  request: Request,
): Promise<Record<string, unknown> | NextResponse> {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return errorResponse("Content-Type must be application/json.", 415);
  }
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return errorResponse("Body must be a JSON object.", 400);
  }
  return body as Record<string, unknown>;
}

type Handler<C> = (request: Request, context: C) => Promise<Response>;

/** Rejects requests that aren't signed in, and turns unexpected errors into a 500 without details. */
export function authed<C>(handler: Handler<C>): Handler<C> {
  return async (request, context) => {
    try {
      if (!(await getSignedIn())) return errorResponse("Not logged in.", 401);
      return await handler(request, context);
    } catch (error) {
      unstable_rethrow(error); // let Next.js handle its own control-flow errors
      console.error("API error", error);
      return errorResponse("Something went wrong. Please try again.", 500);
    }
  };
}
