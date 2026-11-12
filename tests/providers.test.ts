import { afterEach, describe, expect, it, vi } from "vitest";
import {
  _resetModelCacheForTest,
  activeProvider,
  availableModels,
  mapHttpError,
  pcmToWav,
  sseLines,
  synthesize
} from "@/server/providers";

const ORIG_ENV = { ...process.env };
const ORIG_FETCH = globalThis.fetch;

afterEach(() => {
  process.env = { ...ORIG_ENV };
  globalThis.fetch = ORIG_FETCH;
  _resetModelCacheForTest();
});

describe("server/providers", () => {
  it("parses chunked SSE lines including trailing data without final newline", async () => {
    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode("data: {\"a\":1}\n\ndata: {\"b\":"));
        c.enqueue(enc.encode("2}"));
        c.close();
      }
    });
    const res = new Response(stream);
    const lines: string[] = [];
    for await (const l of sseLines(res)) lines.push(l);
    expect(lines).toEqual(['{"a":1}', '{"b":2}']);
  });

  it("wraps PCM bytes with valid RIFF WAVE header", () => {
    const pcm = Buffer.from([1, 2, 3, 4]);
    const wav = Buffer.from(pcmToWav(pcm, 24000));
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.toString("ascii", 8, 12)).toBe("WAVE");
    expect(wav.readUInt32LE(24)).toBe(24000);
    expect(wav.readUInt32LE(40)).toBe(4);
    expect(wav.length).toBe(48);
  });

  it("maps HTTP provider status codes to normalized error codes", () => {
    expect(mapHttpError(429, "RESOURCE_EXHAUSTED quota").code).toBe("provider_quota");
    expect(mapHttpError(429, "slow down").code).toBe("provider_rate_limited");
    expect(mapHttpError(401, "bad token").code).toBe("provider_auth");
    expect(mapHttpError(404, "missing").code).toBe("provider_model");
  });

  it("rejects unsupported AI_PROVIDER cleanly", () => {
    process.env.AI_PROVIDER = "unknown-vendor";
    expect(() => activeProvider()).toThrow(/Unsupported AI_PROVIDER/);
  });

  it("caches models per providerId without cross-provider pollution", async () => {
    process.env.AI_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "g-key";

    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          models: [{ name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] }]
        }),
        { status: 200 }
      )
    ) as unknown as typeof fetch;

    const gModels = await availableModels(new AbortController().signal);
    expect(gModels).toEqual(["gemini-2.5-flash"]);

    process.env.AI_PROVIDER = "openai-compatible";
    process.env.OPENAI_COMPAT_BASE_URL = "https://compat.example/v1";
    process.env.OPENAI_COMPAT_API_KEY = "c-key";
    process.env.OPENAI_COMPAT_MODEL = "llama-3";

    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [{ id: "llama-3" }] }), { status: 200 })
    ) as unknown as typeof fetch;

    const cModels = await availableModels(new AbortController().signal);
    expect(cModels).toEqual(["llama-3"]);
  });

  it("synthesizes PCM into WAV and passes through encoded mp3 directly", async () => {
    process.env.GEMINI_API_KEY = "g-key";

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [{ inlineData: { data: Buffer.from([10, 20]).toString("base64"), mimeType: "audio/L16;rate=24000" } }]
                }
              }
            ]
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [{ inlineData: { data: Buffer.from([99, 100]).toString("base64"), mimeType: "audio/mpeg" } }]
                }
              }
            ]
          }),
          { status: 200 }
        )
      ) as unknown as typeof fetch;

    const wavRes = await synthesize("Hi", new AbortController().signal);
    expect(wavRes.mimeType).toBe("audio/wav");
    expect(Buffer.from(wavRes.data).toString("ascii", 0, 4)).toBe("RIFF");

    const mp3Res = await synthesize("Hi again", new AbortController().signal);
    expect(mp3Res.mimeType).toBe("audio/mpeg");
    expect(Buffer.from(mp3Res.data)).toEqual(Buffer.from([99, 100]));
  });
});
