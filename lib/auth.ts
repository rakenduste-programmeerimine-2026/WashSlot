import { createClient, getBearerToken } from "@/lib/supabase/server";

/** The signed-in user and a client acting as them, or null. Works with the login cookie or a Bearer token. */
export async function getSignedIn() {
  const supabase = await createClient();
  // getClaims verifies the token; a token client has no stored session, so pass it in.
  const { data } = await supabase.auth.getClaims((await getBearerToken()) ?? undefined);
  return data?.claims ? { supabase, userId: data.claims.sub } : null;
}
