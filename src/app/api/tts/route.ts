import { ApiError, requireUser } from "@/server/firebaseAdmin";
import { checkRate, consumeDaily } from "@/server/limits";
import { readEnv } from "@/server/env";
import { ProviderError, synthesize } from "@/server/providers";
import { TtsBodySchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const e = readEnv();
    if (!e.geminiKey) {
      throw new ApiError(503, "tts_unavailable", "Server voice is not configured.");
    }
    const uid = await requireUser(req);
    const parsed = TtsBodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      throw new ApiError(400, "bad_request", "Text must be 1-1200 characters.");
    }

    checkRate(uid, "tts");
    await consumeDaily(uid, "tts");

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), e.timeoutMs);
    try {
      const audio = await synthesize(parsed.data.text, ac.signal);
      return new Response(audio.data, {
        headers: {
          "Content-Type": audio.mimeType,
          "Cache-Control": "no-store"
        }
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    if (err instanceof ProviderError) {
      return Response.json({ error: { code: err.code, message: err.message } }, { status: 502 });
    }
    if (err instanceof ApiError) {
      return Response.json({ error: { code: err.code, message: err.message } }, { status: err.status });
    }
    console.error("[tts]", err);
    return Response.json({ error: { code: "server_error", message: "Voice generation failed." } }, { status: 500 });
  }
}
