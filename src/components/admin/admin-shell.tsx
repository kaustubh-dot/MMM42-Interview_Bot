"use client";

import { Briefcase, CalendarPlus, LayoutDashboard, Loader2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, createContext, useContext } from "react";
import { useAdmin } from "./admin-store";
import "./admin.css";
import { type SyncControls, useInterviewSync } from "./use-interview-sync";

const TABS = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/jobs", label: "Jobs", icon: Briefcase },
  { href: "/admin/schedule", label: "Schedule", icon: CalendarPlus },
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
      <div className="nb-admin min-h-[calc(100vh-5rem)] bg-[#fafafa]">
        <div className="border-b border-[#111]/15 bg-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-1 px-4 py-2 md:px-6">
            <nav aria-label="Recruiter console" className="flex flex-wrap gap-1">
              {TABS.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  aria-current={active(href) ? "page" : undefined}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold ${
                    active(href) ? "bg-[#eeeefe] text-[#111]" : "text-gray-600 hover:bg-[#f3f3f3]"
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
        </div>

        <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 md:px-6">
          {saveFailed && (
            <p role="alert" className="nb-card nb-bg-soft-salmon p-3 text-sm font-medium">
              This browser didn't let us save. Your changes are kept until you close the tab.
            </p>
          )}

          {hydrated ? (
            children
          ) : (
            <p className="flex items-center gap-2 text-sm text-gray-600">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </p>
          )}

          <p className="pt-2 text-xs text-gray-500">
            Demo storage: jobs, names, notes and decisions stay in this browser. Names are never
            sent to scoring.
          </p>
        </div>
      </div>
    </SyncContext.Provider>
  );
}
