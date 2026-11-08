import { authed } from "@/lib/http";
import { getMyBuilding, isAdmin } from "@/lib/queries";
import { NextResponse } from "next/server";

export const GET = authed(async () => {
  const [building, admin] = await Promise.all([getMyBuilding(), isAdmin()]);
  return NextResponse.json({ isAdmin: admin, building });
});
