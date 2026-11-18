import Link from "next/link";
import { Button } from "./ui/button";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "./logout-button";

export async function AuthButton() {
  const supabase = await createClient();

  // You can also use getUser() which will be slower.
  const { data } = await supabase.auth.getClaims();

  const user = data?.claims;
  const displayName = user?.user_metadata?.display_name;
  const name =
    typeof displayName === "string" && displayName.trim()
      ? displayName
      : user?.email;

  return user ? (
    <div className="flex items-center gap-4">
      <span>
        Hey, <span className="inline-block max-w-[10rem] truncate align-bottom">{name}</span>!
      </span>
      <LogoutButton />
    </div>
  ) : (
    <div className="flex gap-2">
      <Button asChild size="sm" variant={"outline"}>
        <Link href="/auth/login">Sign in</Link>
      </Button>
      <Button asChild size="sm" variant={"default"}>
        <Link href="/auth/sign-up">Sign up</Link>
      </Button>
    </div>
  );
}