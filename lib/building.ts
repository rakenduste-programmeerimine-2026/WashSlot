import { getSignedIn } from "@/lib/auth";
import { redirect } from "next/navigation";

export async function getMyBuildingId(): Promise<string | null> {
  const auth = await getSignedIn();
  if (!auth) redirect("/auth/login");

  const { data, error } = await auth.supabase
    .from("profiles")
    .select("building_id")
    .eq("id", auth.userId)
    .maybeSingle();
  // Throw so a failed lookup never looks like "no building yet".
  if (error) throw new Error(`Could not load profile: ${error.message}`);

  return data?.building_id ?? null;
}
