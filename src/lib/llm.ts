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

// Callers validate the unknown JSON against their own task schema. No client action export.
export async function generateJson(request: LlmRequest): Promise<unknown> {
  const mode = process.env.LLM_MODE;
  if (mode === "mock") {
    return structuredClone(request.mockOutput);
  }
  if (mode !== "gemini") {
    throw new LlmError("LLM_CONFIGURATION", "Set LLM_MODE to mock or gemini explicitly.");
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
  if (!text?.trim()) {
    throw new LlmError("LLM_INVALID_RESPONSE", "The model returned an empty JSON response.");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new LlmError("LLM_INVALID_RESPONSE", "The model returned invalid JSON.");
  }
}
