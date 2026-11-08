import { updateMachine } from "@/lib/api/machines";
import { authed, readJson, toResponse } from "@/lib/http";
import { NextResponse } from "next/server";

type Context = { params: Promise<{ id: string }> };

export const PATCH = authed<Context>(async (request, { params }) => {
  const body = await readJson(request);
  if (body instanceof NextResponse) return body;
  return toResponse(await updateMachine((await params).id, body));
});
