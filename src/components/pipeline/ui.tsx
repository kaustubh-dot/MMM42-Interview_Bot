"use client";

// Small neo-brutalist component kit for the interview app. Styles live in brutal.css.

import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "default" | "primary" | "secondary";
type Size = "sm" | "md" | "lg";

function btnClass(variant: Variant, size: Size, extra?: string) {
  return ["nb-btn", variant !== "default" ? variant : "", size !== "md" ? size : "", extra ?? ""]
    .filter(Boolean)
    .join(" ");
}

export function NbButton({
  variant = "default",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button type={type} className={btnClass(variant, size, className)} {...props} />;
}

export function NbLinkButton({
  href,
  variant = "default",
  size = "md",
  className,
  children,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={btnClass(variant, size, className)}>
      {children}
    </Link>
  );
}

export function Sparkle({
  className = "h-7 w-7",
  color = "#111",
}: { className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 1.5c.6 4.9 2.6 7.9 9 10.5-6.4 2.6-8.4 5.6-9 10.5-.6-4.9-2.6-7.9-9-10.5 6.4-2.6 8.4-5.6 9-10.5Z"
        fill={color}
      />
    </svg>
  );
}

export function SectionHeading({
  title,
  subtitle,
  star = "#b6b7fd",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  star?: string;
}) {
  return (
    <div className="space-y-2">
      <h2 className="flex items-center gap-2 text-2xl font-black tracking-tight md:text-3xl">
        <Sparkle color={star} className="h-7 w-7 shrink-0 drop-shadow-[2px_2px_0_#111]" />
        {title}
      </h2>
      {subtitle && <p className="max-w-3xl text-base text-gray-700 md:text-lg">{subtitle}</p>}
    </div>
  );
}

/** Plain-language callout: "What's happening here?" */
export function Explainer({
  title = "What's happening here?",
  children,
}: { title?: string; children: ReactNode }) {
  return (
    <details className="nb-card flat nb-bg-soft-lavender group p-4 text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-bold">
        <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#111] bg-white text-xs">
          ?
        </span>
        {title}
        <span className="ml-auto text-xs font-medium text-gray-600 group-open:hidden">Show</span>
        <span className="ml-auto hidden text-xs font-medium text-gray-600 group-open:inline">
          Hide
        </span>
      </summary>
      <div className="mt-3 space-y-2 text-gray-800">{children}</div>
    </details>
  );
}

export const FLOW_STEPS = ["Upload", "Topics", "Get ready", "Interview", "Report"] as const;

/** Where you are in the interview flow. */
export function StepTracker({ current }: { current: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-2 text-sm" aria-label="Interview steps">
      {FLOW_STEPS.map((label, i) => {
        const state = i < current ? "done" : i === current ? "current" : "todo";
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              aria-current={state === "current" ? "step" : undefined}
              className={`flex items-center gap-2 rounded-full border-2 border-[#111] px-3 py-1 font-bold ${
                state === "current"
                  ? "nb-bg-lavender shadow-[3px_3px_0_#111]"
                  : state === "done"
                    ? "bg-white"
                    : "bg-white text-gray-400 border-gray-300"
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                  state === "done" ? "bg-[#111] text-white" : "border-2 border-current"
                }`}
              >
                {state === "done" ? "✓" : i + 1}
              </span>
              {label}
            </span>
            {i < FLOW_STEPS.length - 1 && (
              <span className="h-0.5 w-4 bg-[#111]/30" aria-hidden="true" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function DemoBadge({
  children = "Demo mode: sample questions, your answers are not graded",
}: { children?: ReactNode }) {
  return <span className="nb-pill nb-bg-salmon">{children}</span>;
}
