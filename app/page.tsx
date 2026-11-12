import { AuthButton } from "@/components/auth-button";
import { EnvVarWarning } from "@/components/env-var-warning";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { getMyBuildingId } from "@/lib/building";
import { hasEnvVars } from "@/lib/utils";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import MachineBoard from "@/components/machine-board";

async function Machines() {
  if (!(await getMyBuildingId())) redirect("/join");
  return <MachineBoard />;
}

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center">
      <nav className="w-full flex justify-center border-b border-b-foreground/10 h-16">
        <div className="w-full max-w-5xl flex justify-between items-center p-3 px-5 text-sm">
          <Link href={"/"} className="font-semibold">
            WashSlot
          </Link>
          {!hasEnvVars ? (
            <EnvVarWarning />
          ) : (
            <Suspense>
              <AuthButton />
            </Suspense>
          )}
        </div>
      </nav>
      <div className="flex-1 w-full max-w-5xl p-5">
        {hasEnvVars && (
          <Suspense>
            <Machines />
          </Suspense>
        )}
      </div>
      <footer className="w-full flex items-center justify-center border-t py-8">
        <ThemeSwitcher />
      </footer>
    </main>
  );
}
