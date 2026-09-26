import { AdminShell } from "@/components/admin/admin-shell";
import { currentRole } from "@/lib/auth/current-role";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Recruiter console · MMM42 Interview",
  description: "Schedule AI interviews, rank candidates by cited evidence and plan follow-ups.",
};

// Recruiters only. src/proxy.ts redirects first; this server check also covers direct renders.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if ((await currentRole()) !== "recruiter") {
    redirect("/login?next=/admin");
  }
  return <AdminShell>{children}</AdminShell>;
}
