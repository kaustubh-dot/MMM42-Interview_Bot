"use client";

import { Briefcase, CalendarPlus, LayoutDashboard, Loader2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, createContext, useContext } from "react";
import { useAdmin } from "./admin-store";
import { type SyncControls, useInterviewSync } from "./use-interview-sync";

const TABS = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/jobs", label: "Jobs & rankings", icon: Briefcase },
  { href: "/admin/schedule", label: "Schedule interview", icon: CalendarPlus },
];

const SyncContext = createContext<SyncControls | null>(null);

export function useSync(): SyncControls {
  const ctx = useContext(SyncContext);
  if (!ctx) {
    throw new Error("useSync must be used inside AdminShell");
  }
  return ctx;
}

function SyncButton({ sync }: { sync: SyncControls }) {
  const time =
    sync.lastSyncedAt &&
    new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(sync.lastSyncedAt);
  return (
    <button
      type="button"
      onClick={() => sync.syncNow()}
      disabled={sync.syncing}
      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-white/70 disabled:opacity-60"
      title="Check the interview server for new results"
    >
      {sync.syncing ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <RefreshCw className="h-4 w-4" />
      )}
      {sync.syncing ? "Checking…" : time ? `Updated ${time}` : "Refresh"}
    </button>
  );
}

/** Recruiter console frame: tabs, live status sync and an honest storage label. */
export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { hydrated, saveFailed } = useAdmin();
  const sync = useInterviewSync();
  const active = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  return (
    <SyncContext.Provider value={sync}>
      <div className="nb-orbs min-h-[calc(100vh-5rem)]">
        <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 md:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="nb-pill nb-bg-lavender">Recruiter console</span>
            <nav aria-label="Recruiter console" className="flex flex-wrap gap-2">
              {TABS.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  aria-current={active(href) ? "page" : undefined}
                  className={`flex items-center gap-2 rounded-lg border-2 px-3 py-1.5 text-sm font-bold ${
                    active(href)
                      ? "border-[#111] bg-white shadow-[3px_3px_0_#111]"
                      : "border-transparent hover:border-[#111] hover:bg-white"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              ))}
            </nav>
            <span className="ml-auto">
              <SyncButton sync={sync} />
            </span>
          </div>

          {saveFailed && (
            <p role="alert" className="nb-card flat nb-bg-soft-salmon p-3 text-sm font-medium">
              This browser didn't let us save. Your changes are kept until you close the tab.
            </p>
          )}

          {hydrated ? (
            children
          ) : (
            <div className="nb-card mx-auto flex max-w-md items-center justify-center gap-3 p-8 font-medium">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading your console…
            </div>
          )}

          <p className="border-t-2 border-dashed border-[#111]/20 pt-4 text-xs text-gray-600">
            Demo storage: jobs, candidate names, notes and decisions are saved in this browser only.
            Interviews run on the server, which keeps them in memory until it restarts. Names are
            never sent to the scoring step.
          </p>
        </div>
      </div>
    </SyncContext.Provider>
  );
}
