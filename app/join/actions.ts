"use server";

import { normalizeBuildingCode } from "@/lib/building-code";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export type JoinState = { error: string | null };

export async function joinBuilding(
  _previous: JoinState,
  formData: FormData,
): Promise<JoinState> {
  const code = normalizeBuildingCode(formData.get("code"));
  if (!code) return { error: "Invalid building code" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("join_building", { code });
  if (error) {
    return {
      error:
        error.code === "P0002"
          ? "Invalid building code"
          : "Could not join the building. Please try again.",
    };
  }

  redirect("/");
}
