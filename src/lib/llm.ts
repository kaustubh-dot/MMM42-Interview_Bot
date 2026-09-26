import "server-only";

import { GoogleGenAI } from "@google/genai";
import type { LlmRequest } from "../types/pipeline-api";

export type LlmErrorCode = "LLM_CONFIGURATION" | "LLM_UPSTREAM" | "LLM_INVALID_RESPONSE";

export class LlmError extends Error {
  readonly code: LlmErrorCode;

  constructor(code: LlmErrorCode, message: string) {
    super(message);
    this.name = "LlmError";
    this.code = code;
  }
}

// Groq free-tier limits are tokens-per-minute per model, so the frequent per-turn grade call uses
// a separate smaller model and never eats the plan/evaluate/audit budget.
const GROQ_MODEL = process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b";
const GROQ_GRADE_MODEL = process.env.GROQ_GRADE_MODEL?.trim() || "openai/gpt-oss-20b";
const GROQ_MAX_ATTEMPTS = 3;
const GROQ_MAX_WAIT_MS = 12_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function parseJsonText(text: string | undefined): unknown {
  if (!text?.trim()) {
    throw new LlmError("LLM_INVALID_RESPONSE", "The model returned an empty JSON response.");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new LlmError("LLM_INVALID_RESPONSE", "The model returned invalid JSON.");
  }
}

// Groq's OpenAI-compatible endpoint via fetch: no extra SDK. JSON mode requires "JSON" in a message.
async function generateGroqJson(request: LlmRequest): Promise<unknown> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    throw new LlmError("LLM_CONFIGURATION", "GROQ_API_KEY is required in groq mode.");
  }
  const model = request.task === "grade" ? GROQ_GRADE_MODEL : GROQ_MODEL;
  let text: string | undefined;
  try {
    for (let attempt = 1; ; attempt++) {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: { type: "json_object" },
          // gpt-oss spends output tokens on hidden reasoning; low keeps calls fast and within TPM.
          ...(model.startsWith("openai/gpt-oss") && { reasoning_effort: "low" }),
          messages: [
            {
              role: "system",
              content: `${request.system}\n\nRespond with a single JSON object only.`,
            },
            { role: "user", content: JSON.stringify(request.input) },
          ],
        }),
        signal: AbortSignal.timeout(30_000),
      });
      // Rate limited: wait what the server asks (capped) and retry a bounded number of times.
      if (response.status === 429 && attempt < GROQ_MAX_ATTEMPTS) {
        const retryAfter = Number(response.headers.get("retry-after"));
        await sleep(
          Math.min(GROQ_MAX_WAIT_MS, Number.isFinite(retryAfter) ? retryAfter * 1000 + 250 : 3000),
        );
        continue;
      }
      if (!response.ok) {
        throw new Error(`status ${response.status}`);
      }
      const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      text = body.choices?.[0]?.message?.content;
      break;
    }
  } catch {
    // Provider errors may contain credentials or candidate input. Do not forward them.
    throw new LlmError(
      "LLM_UPSTREAM",
      `The ${request.task} model request failed. Retry the request.`,
    );
  }
  return parseJsonText(text);
}

// Callers validate the unknown JSON against their own task schema. No client action export.
export async function generateJson(request: LlmRequest): Promise<unknown> {
  const mode = process.env.LLM_MODE;
  if (mode === "mock") {
    return structuredClone(request.mockOutput);
  }
  if (mode === "groq") {
    return generateGroqJson(request);
  }
  if (mode !== "gemini") {
    throw new LlmError("LLM_CONFIGURATION", "Set LLM_MODE to mock, groq or gemini explicitly.");
  }
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new LlmError("LLM_CONFIGURATION", "GEMINI_API_KEY is required in gemini mode.");
  }

  let text: string | undefined;
  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: JSON.stringify(request.input),
      config: {
        systemInstruction: request.system,
        responseMimeType: "application/json",
        httpOptions: { timeout: 30_000, retryOptions: { attempts: 1 } },
      },
    });
    text = response.text;
  } catch {
    // Provider errors may contain credentials or candidate input. Do not forward them.
    throw new LlmError(
      "LLM_UPSTREAM",
      `The ${request.task} model request failed. Retry the request.`,
    );
  }
  return parseJsonText(text);
}
