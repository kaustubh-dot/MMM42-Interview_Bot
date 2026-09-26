"use client";

import { NbButton } from "@/components/pipeline/ui";
import { Briefcase, GraduationCap, Loader2 } from "lucide-react";
import { useState } from "react";

async function signIn(body: Record<string, string>): Promise<string> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { next?: string; error?: string };
  if (!res.ok || !data.next) {
    throw new Error(data.error ?? "Sign-in failed.");
  }
  return data.next;
}

export function LoginScreen({ next, devPasscode }: { next: string; devPasscode: boolean }) {
  const [passcode, setPasscode] = useState("");
  const [busy, setBusy] = useState<"candidate" | "recruiter" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const go = async (role: "candidate" | "recruiter") => {
    setBusy(role);
    setError(null);
    try {
      // Full navigation so the navbar re-renders with the new role.
      window.location.assign(await signIn({ role, passcode, next }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-12">
      <header className="space-y-1">
        <h1 className="text-3xl font-black tracking-tight">Sign in</h1>
        <p className="text-gray-700">Choose how you're using MMM42 Interview.</p>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="space-y-3 rounded-xl border-2 border-[#111] bg-white p-5">
          <h2 className="flex items-center gap-2 text-lg font-black">
            <GraduationCap className="h-5 w-5" /> Candidate
          </h2>
          <p className="text-sm text-gray-700">
            Practice, take an interview, or open an invite link. No password needed.
          </p>
          <NbButton size="sm" disabled={!!busy} onClick={() => go("candidate")}>
            {busy === "candidate" && <Loader2 className="h-4 w-4 animate-spin" />}
            Continue as candidate
          </NbButton>
        </section>
        <form
          className="space-y-3 rounded-xl border-2 border-[#111] bg-white p-5"
          onSubmit={(e) => {
            e.preventDefault();
            go("recruiter");
          }}
        >
          <h2 className="flex items-center gap-2 text-lg font-black">
            <Briefcase className="h-5 w-5" /> Recruiter
          </h2>
          <label htmlFor="passcode" className="block text-sm text-gray-700">
            Team passcode
          </label>
          <input
            id="passcode"
            type="password"
            autoComplete="current-password"
            className="nb-input py-2"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
          />
          {devPasscode && (
            <p className="text-xs text-gray-600">
              Dev mode: ADMIN_PASSCODE isn't set, so the passcode is <code>recruiter</code>.
            </p>
          )}
          <NbButton type="submit" size="sm" variant="primary" disabled={!!busy || !passcode}>
            {busy === "recruiter" && <Loader2 className="h-4 w-4 animate-spin" />}
            Sign in as recruiter
          </NbButton>
        </form>
      </div>
      {error && (
        <p role="alert" className="rounded-lg border-2 border-[#111] nb-bg-soft-salmon p-3 text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
