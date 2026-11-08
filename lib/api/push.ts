import { dbFail, fail, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";

/** The shape of `PushSubscription.toJSON()` in the browser. */
export type PushSubscriptionInput = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

const isEndpoint = (value: unknown): value is string =>
  typeof value === "string" && value.startsWith("https://") && value.length <= 2000;
const isKey = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 200;

function isPushSubscription(value: unknown): value is PushSubscriptionInput {
  const s = value as PushSubscriptionInput;
  return isEndpoint(s?.endpoint) && isKey(s.keys?.p256dh) && isKey(s.keys?.auth);
}

/** Saves this device for notifications. Saving the same device twice is fine. */
export async function savePushSubscription(subscription: unknown): Promise<ActionResult<null>> {
  if (!isPushSubscription(subscription)) return fail("Invalid push subscription.");

  const supabase = await createClient();
  const { error } = await supabase.from("push_subscriptions").insert({
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
  });

  if (error?.code === "23505") {
    // Already saved: fine if it's ours. RLS only shows our own rows.
    const { data: mine } = await supabase
      .from("push_subscriptions")
      .select("id")
      .eq("endpoint", subscription.endpoint)
      .maybeSingle();
    return mine
      ? { ok: true, data: null }
      : fail("This device is registered to another account.", 409);
  }
  return error ? dbFail(error) : { ok: true, data: null };
}

export async function removePushSubscription(endpoint: unknown): Promise<ActionResult<null>> {
  if (!isEndpoint(endpoint)) return fail("Invalid push subscription.");

  const supabase = await createClient();
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  return error ? dbFail(error) : { ok: true, data: null };
}
