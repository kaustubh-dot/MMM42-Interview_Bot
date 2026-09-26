import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "../globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "MMM42 Interview",
  description: "Claim-based voice interview with cited evaluation",
};

// Separate root layout for the pipeline flow: no Supabase providers, so the fixture flow works
// without any backend configured.
export default function PipelineLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        suppressHydrationWarning
        className={`${inter.className} min-h-screen bg-gray-50 text-gray-900`}
      >
        {children}
      </body>
    </html>
  );
}
