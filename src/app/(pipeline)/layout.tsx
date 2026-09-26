import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import "../globals.css";
import "@/components/pipeline/brutal.css";
import { AppFooter, AppNavbar } from "@/components/pipeline/navbar";
import { currentName, currentRole } from "@/lib/auth/current-role";

const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "700", "900"] });

export const metadata: Metadata = {
  title: "MMM42 Interview: practice interviews that show their work",
  description:
    "An AI voice interviewer that asks about what your resume really says, follows up like a person, and shows the exact words behind every score.",
};

// Root layout for the interview app: no Supabase providers, so the demo flow works without any
// backend configured. The legacy FoloUp dashboard keeps its own layouts.
export default async function PipelineLayout({ children }: { children: React.ReactNode }) {
  const [role, name] = await Promise.all([currentRole(), currentName()]);
  return (
    <html lang="en">
      <body
        suppressHydrationWarning
        className={`${dmSans.className} nb flex min-h-screen flex-col antialiased`}
      >
        <AppNavbar role={role} name={name} />
        <main className="flex-1">{children}</main>
        <AppFooter />
      </body>
    </html>
  );
}
