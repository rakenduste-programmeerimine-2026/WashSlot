import { addMachine } from "@/lib/api/machines";
import { authed, readJson, toResponse } from "@/lib/http";
import { getMachineStatuses } from "@/lib/queries";
import { NextResponse } from "next/server";

export const GET = authed(async () => NextResponse.json(await getMachineStatuses()));

export const POST = authed(async (request) => {
  const body = await readJson(request);
  if (body instanceof NextResponse) return body;
  return toResponse(await addMachine(body.label, body.type, body.defaultCycleMinutes), 201);
});
