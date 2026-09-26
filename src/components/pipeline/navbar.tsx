"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { NbLinkButton } from "./ui";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/practice", label: "Coding practice" },
  { href: "/report/sample", label: "Sample report" },
];

export function AppNavbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <header className="nb-navbar">
      <nav className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 md:h-20 md:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 text-xl font-black tracking-tight md:text-2xl"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg border-2 border-[#111] nb-bg-lavender text-base shadow-[3px_3px_0_#111]">
            🎙️
          </span>
          MMM42 Interview
        </Link>
        <ul className="ml-auto hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className={`rounded-lg px-4 py-2 font-medium hover:bg-white/70 ${
                  active(l.href) && l.href !== "/#how-it-works"
                    ? "underline decoration-[#b6b7fd] decoration-4 underline-offset-8"
                    : ""
                }`}
              >
                {l.label}
              </Link>
            </li>
          ))}
          <li className="ml-3">
            <NbLinkButton href="/interview" variant="primary" size="sm">
              Start interview
            </NbLinkButton>
          </li>
        </ul>
        <button
          type="button"
          className="ml-auto rounded-lg border-2 border-[#111] bg-white p-2 md:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>
      {open && (
        <ul className="space-y-1 border-t-2 border-[#111] bg-white px-4 py-3 md:hidden">
          {[...LINKS, { href: "/interview", label: "Start interview" }].map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="block rounded-lg px-3 py-2 font-medium hover:bg-gray-100"
                onClick={() => setOpen(false)}
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </header>
  );
}

export function AppFooter() {
  return (
    <footer className="border-t-2 border-[#111] bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-8 text-sm md:px-6">
        <p className="font-bold">MMM42 Interview</p>
        <p className="text-gray-600">An AI interviewer that shows its work. Built at BitNBuild.</p>
        <div className="ml-auto flex flex-wrap gap-4">
          <Link className="nb-link" href="/interview">
            Start interview
          </Link>
          <Link className="nb-link" href="/practice">
            Coding practice
          </Link>
          <Link className="nb-link" href="/practice/playground">
            Editor &amp; whiteboard playground
          </Link>
          <Link className="nb-link" href="/report/sample">
            Sample report
          </Link>
          <Link className="nb-link" href="/report/workspace-samples">
            Saved code &amp; drawings
          </Link>
        </div>
      </div>
    </footer>
  );
}
