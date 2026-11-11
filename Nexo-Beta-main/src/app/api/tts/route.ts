import { z } from "zod";
import { ApiError, requireUser } from "@/server/firebaseAdmin";
import { checkRate, consumeDaily } from "@/server/limits";
import { env } from "@/server/env";
import { ProviderError, synthesize } from "@/server/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({ text: z.string().min(1).max(1200) });

export async function POST(req: Request) {
  try {
    if (!env.geminiKey) throw new ApiError(503, "tts_unavailable", "Server voice is not configured.");
    const uid = await requireUser(req);
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new ApiError(400, "bad_request", "Text must be 1-1200 characters.");
    checkRate(uid, "tts");
    await consumeDaily(uid, "tts");
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), env.timeoutMs);
    try {
      const wav = await synthesize(parsed.data.text, ac.signal);
      return new Response(wav, { headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" } });
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    if (e instanceof ProviderError) return Response.json({ error: { code: e.code, message: e.message } }, { status: 502 });
    if (e instanceof ApiError) return Response.json({ error: { code: e.code, message: e.message } }, { status: e.status });
    console.error("[tts]", e);
    return Response.json({ error: { code: "server_error", message: "Voice generation failed." } }, { status: 500 });
  }
}
