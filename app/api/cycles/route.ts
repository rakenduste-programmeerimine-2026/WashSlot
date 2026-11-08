import { startCycle } from "@/lib/api/cycles";
import { authed, readJson, toResponse } from "@/lib/http";
import { NextResponse } from "next/server";

export const POST = authed(async (request) => {
  const body = await readJson(request);
  if (body instanceof NextResponse) return body;
  return toResponse(await startCycle(body.machineId, body.minutes), 201);
});
