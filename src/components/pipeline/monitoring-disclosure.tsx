"use client";

import { CheckCircle2, Loader2, Mic, XCircle } from "lucide-react";
import { useState } from "react";
import { NbButton } from "./ui";

interface Props {
  faceSignalsEnabled: boolean;
  speechSupported: boolean;
  onStart: () => void;
  onBack: () => void;
}

type MicState = "untested" | "testing" | "ok" | "denied" | "missing";

/** "Get ready": how the live interview works, a mic check, and what is monitored. */
export function MonitoringDisclosure({
  faceSignalsEnabled,
  speechSupported,
  onStart,
  onBack,
}: Props) {
  const [agreed, setAgreed] = useState(false);
  const [mic, setMic] = useState<MicState>("untested");

  const testMic = async () => {
    setMic("testing");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      for (const track of stream.getTracks()) {
        track.stop();
      }
      setMic("ok");
    } catch (err) {
      setMic(err instanceof DOMException && err.name === "NotFoundError" ? "missing" : "denied");
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-black tracking-tight md:text-4xl">Get ready</h1>
        <p className="text-lg text-gray-700">
          It works like a real conversation. Here's all you need to know.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="nb-card space-y-4 p-6">
          <h2 className="text-xl font-black">How the conversation works</h2>
          <ol className="space-y-3">
            {[
              [
                "🗣️",
                "The interviewer reads each question out loud.",
                "In a hurry? Press “Skip to my answer”.",
              ],
              [
                "🎙️",
                "Just talk. Your words appear on screen as you speak.",
                "No record or submit buttons.",
              ],
              [
                "⏸️",
                "Pause for about 3 seconds when you're done.",
                "That's how the interviewer knows you've finished.",
              ],
              [
                "✋",
                "Long answers get a polite interruption.",
                "After about 75 seconds, just like a real interviewer.",
              ],
              [
                "🧑‍💻",
                "Some questions open a code editor or whiteboard.",
                "Talk while you work, then press “I'm done”.",
              ],
            ].map(([icon, title, hint]) => (
              <li key={title} className="flex gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-2 border-[#111] bg-white text-lg">
                  {icon}
                </span>
                <span>
                  <span className="block font-bold">{title}</span>
                  <span className="block text-sm text-gray-600">{hint}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="text-sm text-gray-600">
            Prefer typing? You can switch any time during the interview.
          </p>
        </section>

        <div className="space-y-6">
          <section className="nb-card space-y-3 p-6">
            <h2 className="text-xl font-black">1. Check your microphone</h2>
            {!speechSupported && (
              <p
                role="alert"
                className="rounded-xl border-2 border-[#111] nb-bg-soft-salmon p-3 text-sm"
              >
                Voice answers need Google Chrome. You can still do the interview by typing.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <NbButton onClick={testMic} disabled={mic === "testing"}>
                {mic === "testing" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
                {mic === "ok" ? "Test again" : "Test my microphone"}
              </NbButton>
              {mic === "ok" && (
                <span className="flex items-center gap-1 font-bold text-emerald-700">
                  <CheckCircle2 className="h-5 w-5" /> Microphone ready
                </span>
              )}
              {(mic === "denied" || mic === "missing") && (
                <span className="flex items-center gap-1 text-sm font-bold text-[#b4232f]">
                  <XCircle className="h-5 w-5" />
                  {mic === "denied"
                    ? "Blocked. Click the lock icon in the address bar and allow the microphone."
                    : "No microphone found."}
                </span>
              )}
            </div>
          </section>

          <section className="nb-card space-y-3 p-6">
            <h2 className="text-xl font-black">2. What we notice (and what we don't)</h2>
            <ul className="space-y-1.5 text-sm text-gray-800">
              <li>• If you leave this tab or window, and for how long.</li>
              <li>• If you paste text, and how many characters. We never keep what you pasted.</li>
              <li>• How long you take to start answering.</li>
              <li>
                •{" "}
                {faceSignalsEnabled
                  ? "Camera signals (face visible, looking away). Video stays in your browser."
                  : "Camera signals are off for this interview."}
              </li>
            </ul>
            <p className="rounded-xl border-2 border-[#111] nb-bg-soft-lavender p-3 text-sm">
              These only become a <strong>Low / Medium / High note for a person</strong> to look at.
              Each has innocent explanations. They never change your score, never stop the
              interview, and never decide that someone cheated.
            </p>
          </section>
        </div>
      </div>

      <section className="nb-card flex flex-wrap items-center gap-4 p-5">
        <label className="flex items-center gap-3 font-medium">
          <input
            type="checkbox"
            className="h-5 w-5 accent-[#494cf3]"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
          />
          I understand how it works and what is noticed.
        </label>
        <div className="ml-auto flex gap-3">
          <NbButton onClick={onBack}>Back</NbButton>
          <NbButton variant="primary" size="lg" disabled={!agreed} onClick={onStart}>
            Start interview
          </NbButton>
        </div>
      </section>
    </div>
  );
}
