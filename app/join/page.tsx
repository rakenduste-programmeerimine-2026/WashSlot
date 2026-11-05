import { JoinForm } from "@/components/join-form";
import { LogoutButton } from "@/components/logout-button";
import { getMyBuildingId } from "@/lib/building";
import { redirect } from "next/navigation";
import { Suspense } from "react";

async function JoinContent() {
  if (await getMyBuildingId()) redirect("/");
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="w-full">
        <JoinForm />
      </div>
      <LogoutButton />
    </div>
  );
}

export default function Page() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Suspense>
          <JoinContent />
        </Suspense>
      </div>
    </div>
  );
}
