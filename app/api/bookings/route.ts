import { createBooking } from "@/lib/api/bookings";
import { authed, readJson, toResponse } from "@/lib/http";
import { getMyBookings } from "@/lib/queries";
import { NextResponse } from "next/server";

export const GET = authed(async () => NextResponse.json(await getMyBookings()));

export const POST = authed(async (request) => {
  const body = await readJson(request);
  if (body instanceof NextResponse) return body;
  return toResponse(await createBooking(body.machineId, body.startsAt, body.endsAt), 201);
});
