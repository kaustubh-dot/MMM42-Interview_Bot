import { AdminShell } from "@/components/admin/admin-shell";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Recruiter console · MMM42 Interview",
  description: "Schedule AI interviews, rank candidates by cited evidence and plan follow-ups.",
};

// Recruiter console. Auth is cut for the hackathon (CLAUDE.md §12), so this route is open.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
