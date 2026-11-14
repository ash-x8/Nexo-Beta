import { readEnv } from "@/server/env";
import { getGeminiClient } from "./geminiSdk";

const SENSITIVE_PATTERN =
  /(password|passcode|passphrase|\botp\b|\bpin\b|api[\s_-]?key|secret|token|private key|card number|cvv|credit card|\bssn\b|\b\d{12,19}\b)/i;

export interface MemoryConsolidationResult {
  summary: string;
  extractedFacts: Array<{ text: string; category: "preference" | "profile" | "project" | "decision" | "general" }>;
}

/**
 * Generates an updated rolling conversation summary and non-sensitive structured memory facts
 * using the configured lightweight model on the server.
 */
export async function consolidateConversationMemory(opts: {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  previousSummary?: string;
  existingFacts?: string[];
}): Promise<MemoryConsolidationResult> {
  const env = readEnv();
  const transcript = opts.messages
    .slice(-18)
    .map((m) => `${m.role === "user" ? "User" : "NEXO"}: ${m.content.slice(0, 1000)}`)
    .join("\n");

  if (!env.geminiKey) {
    // Deterministic lightweight summary fallback when no server key is set
    const userLines = opts.messages
      .filter((m) => m.role === "user" && m.content.trim())
      .slice(-4)
      .map((m) => m.content.trim().slice(0, 140));
    return {
      summary: [opts.previousSummary, ...userLines].filter(Boolean).join(" | ").slice(0, 1200),
      extractedFacts: []
    };
  }

  const ai = getGeminiClient();
  const prompt = [
    "You are NEXO v1 Memory Consolidator.",
    "Task 1: Produce a concise rolling conversation summary (max 120 words) capturing key goals, context, and decisions.",
    "Task 2: Extract ONLY stable, non-sensitive user preferences, profile context, active project details, or explicit decisions (max 3 new facts, each <= 160 chars).",
    "NEVER extract passwords, API keys, tokens, financial card numbers, OTPs, or secrets.",
    opts.previousSummary ? `Previous summary: ${opts.previousSummary.slice(0, 1500)}` : "",
    opts.existingFacts?.length ? `Existing saved facts:\n${opts.existingFacts.map((f) => `- ${f}`).join("\n")}` : "",
    `Recent conversation:\n${transcript}`,
    'Respond ONLY with JSON: {"summary":"...","facts":[{"text":"...","category":"preference"|"profile"|"project"|"decision"|"general"}]}'
  ]
    .filter(Boolean)
    .join("\n\n");

  const res = await ai.models.generateContent({
    model: env.geminiModel || "gemini-2.5-flash",
    contents: prompt,
    config: {
      temperature: 0.2,
      responseMimeType: "application/json"
    }
  });

  const parsed = JSON.parse((res.text || "{}").trim()) as {
    summary?: string;
    facts?: Array<{ text?: string; category?: string }>;
  };

  const existingLower = new Set((opts.existingFacts || []).map((f) => f.trim().toLowerCase()));
  const allowedCats = new Set(["preference", "profile", "project", "decision", "general"]);

  const extractedFacts = (Array.isArray(parsed.facts) ? parsed.facts : [])
    .filter((f) => typeof f?.text === "string" && f.text.trim().length > 4)
    .map((f) => ({
      text: f.text!.trim().slice(0, 260),
      category: (allowedCats.has(f.category || "") ? f.category : "general") as
        | "preference"
        | "profile"
        | "project"
        | "decision"
        | "general"
    }))
    .filter((f) => !SENSITIVE_PATTERN.test(f.text) && !existingLower.has(f.text.toLowerCase()))
    .slice(0, 3);

  return {
    summary: (parsed.summary || opts.previousSummary || "").trim().slice(0, 3800),
    extractedFacts
  };
}
