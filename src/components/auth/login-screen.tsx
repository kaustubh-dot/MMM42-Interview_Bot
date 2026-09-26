"use client";

import { NbButton, NbLinkButton } from "@/components/pipeline/ui";
import type { Role } from "@/lib/auth/session";
import { Briefcase, Eye, EyeOff, GraduationCap, Loader2 } from "lucide-react";
import { useState } from "react";

async function post(url: string, body?: Record<string, string>) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = (await res.json().catch(() => ({}))) as { next?: string; error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? "Sign-in failed. Try again.");
  }
  return data;
}

const TABS: { key: Role; label: string; icon: typeof GraduationCap }[] = [
  { key: "candidate", label: "Candidate", icon: GraduationCap },
  { key: "recruiter", label: "Recruiter", icon: Briefcase },
];

interface Props {
  next: string;
  initialTab: Role;
  role: Role | null;
  name: string | null;
  devPasscode: boolean;
}

export function LoginScreen({ next, initialTab, role, name, devPasscode }: Props) {
  const [tab, setTab] = useState<Role>(initialTab);
  const [candidateName, setCandidateName] = useState(name ?? "");
  const [passcode, setPasscode] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await post("/api/auth/login", {
        role: tab,
        next,
        ...(tab === "candidate" ? { name: candidateName } : { passcode }),
      });
      // Full navigation so the server-rendered navbar picks up the new role.
      window.location.assign(data.next || (tab === "recruiter" ? "/admin" : "/"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
      setBusy(false);
    }
  };

  if (role) {
    return (
      <div className="nb-orbs flex min-h-[calc(100vh-5rem)] items-center justify-center px-4 py-12">
        <div className="nb-card w-full max-w-md space-y-4 p-6 text-center">
          <h1 className="text-2xl font-black">You're signed in</h1>
          <p className="text-gray-700">
            {name ? `${name}, you're` : "You're"} using the app as a <strong>{role}</strong>.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <NbLinkButton href={next || (role === "recruiter" ? "/admin" : "/")} variant="primary">
              {role === "recruiter" ? "Open recruiter console" : "Continue"}
            </NbLinkButton>
            <NbButton
              onClick={async () => {
                await post("/api/auth/logout").catch(() => null);
                window.location.reload();
              }}
            >
              Switch account
            </NbButton>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="nb-orbs flex min-h-[calc(100vh-5rem)] items-center justify-center px-4 py-12">
      <form
        className="nb-card w-full max-w-md space-y-5 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <header className="space-y-1 text-center">
          <h1 className="text-3xl font-black tracking-tight">Welcome</h1>
          <p className="text-sm text-gray-600">Sign in to continue to MMM42 Interview.</p>
        </header>

        <div
          role="tablist"
          aria-label="Sign in as"
          className="grid grid-cols-2 gap-1 rounded-xl border-2 border-[#111] bg-[#f3f3f3] p-1"
        >
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => {
                setTab(key);
                setError(null);
              }}
              className={`flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-bold transition-colors ${
                tab === key ? "bg-white shadow-[2px_2px_0_#111]" : "text-gray-600 hover:text-[#111]"
              }`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {tab === "candidate" ? (
          <div className="space-y-2">
            <label htmlFor="login-name" className="block text-sm font-bold">
              Your name <span className="font-normal text-gray-500">(optional)</span>
            </label>
            <input
              id="login-name"
              className="nb-input py-2.5"
              autoComplete="name"
              maxLength={80}
              placeholder="e.g. Priya Sharma"
              value={candidateName}
              onChange={(e) => setCandidateName(e.target.value)}
            />
            <p className="text-xs text-gray-600">
              Shown to the hiring team with your interview. It's never used for scoring. No password
              needed.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <label htmlFor="login-passcode" className="block text-sm font-bold">
              Team passcode
            </label>
            <div className="relative">
              <input
                id="login-passcode"
                type={show ? "text" : "password"}
                className="nb-input py-2.5 pr-11"
                autoComplete="current-password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                aria-label={show ? "Hide passcode" : "Show passcode"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-[#111]"
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-gray-600">
              {devPasscode
                ? "Dev mode: ADMIN_PASSCODE isn't set, so the passcode is “recruiter”."
                : "Ask your team lead for the recruiter passcode."}
            </p>
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-lg border-2 border-[#111] nb-bg-soft-salmon px-3 py-2 text-sm"
          >
            {error}
          </p>
        )}

        <NbButton
          type="submit"
          variant="primary"
          className="w-full"
          disabled={busy || (tab === "recruiter" && !passcode)}
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {tab === "candidate" ? "Continue as candidate" : "Sign in to recruiter console"}
        </NbButton>

        <p className="text-center text-xs text-gray-500">
          {tab === "candidate"
            ? "Got an interview link from a recruiter? Just open it; no sign-in needed."
            : "Recruiters schedule interviews, compare candidates and plan follow-ups."}
        </p>
      </form>
    </div>
  );
}
