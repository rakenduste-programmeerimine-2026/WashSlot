import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function getMyBuildingId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) redirect("/auth/login");

  const { data, error } = await supabase
    .from("profiles")
    .select("building_id")
    .eq("id", auth.claims.sub)
    .maybeSingle();
  // Throw so a failed lookup never looks like "no building yet".
  if (error) throw new Error(`Could not load profile: ${error.message}`);

  return data?.building_id ?? null;
}
