import { readEnv } from "./env";
import type { Source } from "@/lib/types";

export interface SearchResult {
  context: string;
  sources: Source[];
}

/** Tavily web search. Returns null when search is not configured or fails (chat continues without it). */
export async function webSearch(query: string, signal: AbortSignal): Promise<SearchResult | null> {
  const env = readEnv();
  if (!env.tavilyKey || !query.trim()) return null;
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.tavilyKey}` },
      body: JSON.stringify({ query: query.slice(0, 380), max_results: 5, search_depth: "basic" }),
      signal
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { results?: Array<{ title?: string; url?: string; content?: string }> };
    const results = (j.results || []).filter((r) => r.url && r.title).slice(0, 5);
    if (!results.length) return null;
    return {
      sources: results.map((r) => ({ title: String(r.title), url: String(r.url) })),
      context: results
        .map((r, i) => `[${i + 1}] ${r.title} (${r.url})\n${String(r.content || "").slice(0, 700)}`)
        .join("\n\n")
    };
  } catch {
    return null;
  }
}
