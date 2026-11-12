import { afterEach, describe, expect, it, vi } from "vitest";
import { parseNdjsonLine, streamChat } from "@/lib/api";

const ORIG_FETCH = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = ORIG_FETCH;
});

describe("lib/api streaming", () => {
  it("parses valid NDJSON lines and ignores blank or malformed lines", () => {
    expect(parseNdjsonLine("")).toBeNull();
    expect(parseNdjsonLine("{broken")).toBeNull();
    expect(parseNdjsonLine('{"t":"hello"}')).toEqual({ t: "hello" });
  });

  it("yields all streamed events including trailing chunk without trailing newline", async () => {
    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode('{"sources":[{"title":"Docs","url":"https://example.com"}]}\n'));
        c.enqueue(enc.encode('{"t":"Hel'));
        c.enqueue(enc.encode('lo"}\n{"done":true}'));
        c.close();
      }
    });

    globalThis.fetch = vi.fn().mockResolvedValueOnce(new Response(stream, { status: 200 })) as unknown as typeof fetch;

    const events = [];
    for await (const ev of streamChat({
      token: "tok",
      messages: [{ role: "user", content: "hi" }],
      language: "auto",
      memory: [],
      useSearch: true,
      signal: new AbortController().signal
    })) {
      events.push(ev);
    }

    expect(events).toEqual([
      { sources: [{ title: "Docs", url: "https://example.com" }] },
      { t: "Hello" },
      { done: true }
    ]);
  });

  it("throws ApiClientError on non-OK HTTP responses", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: "rate_limited", message: "Slow down" } }), { status: 429 })
      ) as unknown as typeof fetch;

    const run = async () => {
      for await (const _ of streamChat({
        token: "tok",
        messages: [{ role: "user", content: "hi" }],
        language: "auto",
        memory: [],
        useSearch: false,
        signal: new AbortController().signal
      })) {
        /* noop */
      }
    };

    await expect(run()).rejects.toThrow("Slow down");
  });
});
