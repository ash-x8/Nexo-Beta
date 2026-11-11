import type { MemoryItem } from "./types";

export const MEMORY_LIMIT = 20;

/** Memories are plain text sent to the AI, so refuse things that look like secrets. */
const SENSITIVE = /(password|passcode|passphrase|\botp\b|\bpin\b|api[\s_-]?key|secret|token|private key|card number|cvv|credit card|\bssn\b|\b\d{12,19}\b)/i;
export const looksSensitive = (text: string) => SENSITIVE.test(text);

const words = (s: string) => new Set(s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2));

/** Up to `max` enabled memories, ranked by word overlap with the user's message (newest wins ties). */
export function selectMemories(items: MemoryItem[], query: string, max = 8): string[] {
  const on = items.filter((m) => m.enabled !== false);
  if (on.length <= max) return on.map((m) => m.text);
  const q = words(query);
  return on
    .map((m) => ({ m, score: [...words(m.text)].filter((w) => q.has(w)).length }))
    .sort((a, b) => b.score - a.score || b.m.createdAt - a.m.createdAt)
    .slice(0, max)
    .map((x) => x.m.text);
}
