import { removePushSubscription, savePushSubscription } from "@/lib/api/push";
import { authed, readJson, toResponse } from "@/lib/http";
import { NextResponse } from "next/server";

export const POST = authed(async (request) => {
  const body = await readJson(request);
  if (body instanceof NextResponse) return body;
  return toResponse(await savePushSubscription(body), 201);
});

export const DELETE = authed(async (request) => {
  const body = await readJson(request);
  if (body instanceof NextResponse) return body;
  return toResponse(await removePushSubscription(body.endpoint));
});
