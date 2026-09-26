import { NbLinkButton, SectionHeading, Sparkle } from "@/components/pipeline/ui";
import { ArrowDown, ArrowUpRight, FileText, MessagesSquare, PenTool, Search } from "lucide-react";
import Link from "next/link";

const STEPS = [
  {
    n: 1,
    title: "Upload your resume + the job",
    body: "Add your resume PDF and paste the job description. That's the only setup.",
    icon: FileText,
    tone: "nb-bg-1",
  },
  {
    n: 2,
    title: "We pick what to ask",
    body: "We find the resume claims the job cares about most and start with the vaguest ones.",
    icon: Search,
    tone: "nb-bg-2",
  },
  {
    n: 3,
    title: "Talk it through, out loud",
    body: "The interviewer speaks, listens, follows up on your words, and cuts in if you ramble, just like a real one.",
    icon: MessagesSquare,
    tone: "nb-bg-3",
  },
  {
    n: 4,
    title: "Get a report that shows its work",
    body: "Every score quotes the exact words you said. Click a quote to see it in the transcript.",
    icon: PenTool,
    tone: "nb-bg-4",
  },
];

const PROMISES = [
  {
    title: "Every score shows your words",
    body: "No mystery numbers. Each score links to the exact sentence you said. If the evidence doesn't match the transcript, the score is thrown out.",
  },
  {
    title: "One simple rule picks the next question",
    body: "Good answer (2 or more out of 3)? We go one level deeper. Struggling? We step back to basics once. After 4 questions on a topic, or 2 tough ones in a row, we move on.",
  },
  {
    title: "Monitoring never decides anything",
    body: "Tab switches and pastes become a Low, Medium or High note for a person to look at. They never change your score and never call anyone a cheater.",
  },
];

const TRY = [
  {
    href: "/interview",
    title: "Demo interview",
    body: "No upload needed. Answer sample questions out loud.",
    tone: "nb-bg-3",
  },
  {
    href: "/practice",
    title: "Practice",
    body: "Coding, system design and SQL questions from open-source sets, with an AI tutor for hints and step-by-step help.",
    tone: "nb-bg-2",
  },
];

function HeroMock() {
  return (
    <div className="nb-card relative w-full max-w-md space-y-4 p-5" aria-hidden="true">
      <div className="flex items-center gap-3">
        <span className="nb-speaking flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#111] nb-bg-lavender text-xl">
          🤖
        </span>
        <div>
          <p className="text-sm font-bold">AI interviewer</p>
          <p className="text-xs text-gray-600">Question 2 of 8 · PostgreSQL</p>
        </div>
      </div>
      <p className="rounded-2xl rounded-tl-none border-2 border-[#111] bg-white p-3 text-sm">
        You mentioned a composite index on customer_id and created_at. Why that column order?
      </p>
      <p className="ml-8 rounded-2xl rounded-tr-none border-2 border-[#111] nb-bg-salmon p-3 text-sm">
        Customer first because we always filter by customer, then sort by date…
      </p>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="nb-pill nb-bg-soft-lavender">Why this question?</span>
        <span>Strong answer → going one level deeper</span>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="nb-orbs">
        <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-7xl items-center gap-10 px-4 py-12 md:px-6 lg:grid-cols-[1.2fr_1fr]">
          <div className="space-y-6">
            <h1 className="text-4xl font-black leading-tight tracking-tight sm:text-5xl xl:text-6xl">
              Practice interviews <br className="hidden sm:block" />
              that actually listen.
              <Sparkle className="ml-2 inline h-10 w-10 align-top" color="#b6b7fd" />
            </h1>
            <p className="max-w-xl text-lg text-gray-700 md:text-xl">
              Upload your resume and a job description. An AI interviewer asks about what you really
              wrote, reacts to your answers out loud, and shows you exactly which of your words
              earned each score.
            </p>
            <div className="flex flex-wrap gap-4">
              <NbLinkButton href="/interview" variant="primary" size="lg">
                Start an interview
              </NbLinkButton>
              <NbLinkButton href="/practice" size="lg">
                Practice with AI
              </NbLinkButton>
            </div>
            <p className="text-sm text-gray-600">
              Voice-first · Works best in Google Chrome · No sign-up · A demo mode needs no upload
            </p>
          </div>
          <div className="flex justify-center lg:justify-end">
            <HeroMock />
          </div>
        </div>
        <a
          href="#how-it-works"
          aria-label="Scroll to how it works"
          className="nb-bounce absolute bottom-6 left-1/2 hidden -translate-x-1/2 rounded-full border-2 border-[#111] bg-white p-2 md:block"
        >
          <ArrowDown className="h-5 w-5" />
        </a>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="nb-orbs alt scroll-mt-20">
        <div className="mx-auto max-w-7xl space-y-8 px-4 py-16 md:px-6">
          <SectionHeading
            title="How it works"
            subtitle="Four steps, about ten minutes. You always know what's happening and why."
            star="#ffc3be"
          />
          <ol className="grid gap-6 md:grid-cols-2">
            {STEPS.map(({ n, title, body, icon: Icon, tone }) => (
              <li key={n} className={`nb-tile ${tone} flex items-start gap-4 p-6`}>
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border-2 border-[#111] bg-white text-[#111]">
                  <Icon className="h-7 w-7" />
                </span>
                <div>
                  <p className="text-sm font-bold opacity-90">Step {n}</p>
                  <h3 className="text-xl font-black md:text-2xl">{title}</h3>
                  <p className="mt-1 text-white/95">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Promises */}
      <section className="nb-orbs mint">
        <div className="mx-auto max-w-7xl space-y-8 px-4 py-16 md:px-6">
          <SectionHeading
            title="Why you can trust the result"
            subtitle="Interview tools often feel like a black box. This one explains itself."
          />
          <div className="grid gap-6 md:grid-cols-3">
            {PROMISES.map((p) => (
              <article key={p.title} className="nb-card hoverable space-y-2 p-6">
                <h3 className="text-lg font-black">{p.title}</h3>
                <p className="text-gray-700">{p.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Try it */}
      <section className="nb-orbs alt">
        <div className="mx-auto max-w-7xl space-y-8 px-4 py-16 md:px-6">
          <SectionHeading
            title="Try it yourself"
            subtitle="Jump straight to any part of the project."
            star="#ffc3be"
          />
          <div className="grid gap-6 md:grid-cols-2">
            {TRY.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className={`nb-tile ${t.tone} group flex items-center justify-between gap-4 p-6 transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5`}
              >
                <div>
                  <h3 className="text-2xl font-black">{t.title}</h3>
                  <p className="text-white/95">{t.body}</p>
                </div>
                <ArrowUpRight className="h-8 w-8 shrink-0 transition-transform group-hover:-translate-y-1 group-hover:translate-x-1" />
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
