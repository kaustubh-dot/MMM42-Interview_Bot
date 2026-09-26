// Pure helpers for sharing a scheduled interview: candidate link, email draft, calendar file and
// CSV export. Nothing here sends anything; the recruiter's own mail/calendar app does.

import type { AdminCandidate, AdminJob } from "./types";

/** Candidates may open the link this many minutes before the scheduled time. */
export const EARLY_JOIN_MIN = 10;

export function invitePath(candidate: Pick<AdminCandidate, "interviewId" | "scheduledAt">) {
  return `/invite/${encodeURIComponent(candidate.interviewId)}?at=${encodeURIComponent(candidate.scheduledAt)}`;
}

export function inviteUrl(origin: string, candidate: AdminCandidate): string {
  return `${origin.replace(/\/$/, "")}${invitePath(candidate)}`;
}

export function inviteMessage(job: AdminJob, candidate: AdminCandidate, url: string, when: string) {
  const first = candidate.name.trim().split(/\s+/)[0] || "there";
  return {
    subject: `Your interview for ${job.title}`,
    body: [
      `Hi ${first},`,
      "",
      `You're invited to a ${candidate.durationMin}-minute voice interview for ${job.title} on ${when}.`,
      "",
      `Join here: ${url}`,
      "",
      "What to expect:",
      "- The AI interviewer asks about specific things on your resume that matter for this role.",
      "- Use Google Chrome with a working microphone, somewhere quiet.",
      `- The link opens ${EARLY_JOIN_MIN} minutes before your time.`,
      "- Tab switches and pastes are noted for a person to review. They never change your score.",
      "",
      "A person on our team reviews every result before any decision.",
      "",
      "Good luck!",
    ].join("\n"),
  };
}

export function mailtoHref(to: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

const icsDate = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
const icsText = (s: string) =>
  s
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/([,;])/g, "\\$1");

/** RFC 5545 calendar event. Lines are CRLF-separated as the spec requires. */
export function icsEvent(opts: {
  uid: string;
  start: Date;
  durationMin: number;
  title: string;
  description: string;
  url: string;
  now?: Date;
}): string {
  const end = new Date(opts.start.getTime() + opts.durationMin * 60_000);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MMM42 Interview//Recruiter console//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${opts.uid}@mmm42-interview`,
    `DTSTAMP:${icsDate(opts.now ?? new Date())}`,
    `DTSTART:${icsDate(opts.start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsText(opts.title)}`,
    `DESCRIPTION:${icsText(opts.description)}`,
    `URL:${opts.url}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

/** RFC 4180 CSV; every cell is quoted so commas, quotes and newlines in notes are safe. */
export function toCsv(rows: (string | number)[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const text = String(cell);
          // Leading =, +, - or @ would run as a formula in spreadsheet apps.
          const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
          return `"${safe.replace(/"/g, '""')}"`;
        })
        .join(","),
    )
    .join("\r\n");
}

/** Local `YYYY-MM-DDTHH:mm` for <input type="datetime-local">. */
export function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
