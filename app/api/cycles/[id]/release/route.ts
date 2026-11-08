import { releaseCycle } from "@/lib/api/cycles";
import { authed, readJson, toResponse } from "@/lib/http";
import { NextResponse } from "next/server";

type Context = { params: Promise<{ id: string }> };

export const POST = authed<Context>(async (request, { params }) => {
  const body = await readJson(request);
  if (body instanceof NextResponse) return body;
  return toResponse(await releaseCycle((await params).id, body.reason));
});
