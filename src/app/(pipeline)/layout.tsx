import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import "../globals.css";
import "@/components/pipeline/brutal.css";
import { AppFooter, AppNavbar } from "@/components/pipeline/navbar";

const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "700", "900"] });

export const metadata: Metadata = {
  title: "MMM42 Interview: practice interviews that show their work",
  description:
    "An AI voice interviewer that asks about what your resume really says, follows up like a person, and shows the exact words behind every score.",
};

// Root layout for the interview app: no Supabase providers, so the demo flow works without any
// backend configured. The legacy FoloUp dashboard keeps its own layouts.
export default function PipelineLayout({ children }: { children: React.ReactNode }) {
  return (
    // Browser extensions can add root attributes (for example class="hydrated")
    // before React starts. Ignore only that root-attribute mismatch.
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${dmSans.className} nb flex min-h-screen flex-col antialiased`}
      >
        <AppNavbar />
        <main className="flex-1">{children}</main>
        <AppFooter />
      </body>
    </html>
  );
}
