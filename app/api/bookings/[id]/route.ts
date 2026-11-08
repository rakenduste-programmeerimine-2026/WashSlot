import { cancelBooking } from "@/lib/api/bookings";
import { authed, toResponse } from "@/lib/http";

type Context = { params: Promise<{ id: string }> };

export const DELETE = authed<Context>(async (_request, { params }) =>
  toResponse(await cancelBooking((await params).id)),
);
