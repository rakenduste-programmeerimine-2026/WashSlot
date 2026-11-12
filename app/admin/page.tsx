import AdminMachines from "@/components/admin-machines";
import Link from "next/link";

export default function AdminPage() {
  return (
    <main className="mx-auto w-full max-w-5xl p-5">
      <Link href="/" className="text-sm underline">Back to machines</Link>
      <AdminMachines />
    </main>
  );
}