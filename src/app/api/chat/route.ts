import { z } from "zod";
import { ApiError, requireUser } from "@/server/firebaseAdmin";
import { acquireInflight, checkRate, consumeDaily } from "@/server/limits";
import { env, providerConfigured } from "@/server/env";
import { ProviderError, streamChat, type ProviderMessage } from "@/server/providers";
import { webSearch } from "@/server/search";
import { systemPrompt } from "@/server/prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ALLOWED_MIME = /^(image\/(png|jpe?g|webp|gif)|application\/pdf|text\/.*|application\/json)$/;

const Body = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(40000),
        attachments: z
          .array(z.object({ name: z.string().max(200), mime: z.string().max(100), data: z.string().optional(), text: z.string().max(200000).optional() }))
          .max(4)
          .optional()
      })
    )
    .min(1)
    .max(200),
  language: z.enum(["en", "si", "auto"]).default("auto"),
  memory: z.array(z.string().max(300)).max(20).default([]),
  useSearch: z.boolean().default(false)
});

function jsonError(e: unknown) {
  const err = e instanceof ApiError ? e : new ApiError(500, "server_error", "Something went wrong on the server.");
  if (!(e instanceof ApiError)) console.error("[chat]", e);
  return Response.json({ error: { code: err.code, message: err.message } }, { status: err.status });
}

export async function POST(req: Request) {
  let release: (() => void) | undefined;
  try {
    if (!providerConfigured()) throw new ApiError(503, "server_config", "The AI provider is not configured on the server yet.");
    const uid = await requireUser(req);

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new ApiError(400, "bad_request", "Invalid request.");
    const body = parsed.data;

    const history = body.messages.slice(-env.maxHistory);
    if (history[history.length - 1].role !== "user") throw new ApiError(400, "bad_request", "The last message must be from the user.");
    const last = history[history.length - 1];
    if (last.content.length > env.maxInputChars) throw new ApiError(413, "too_long", `Message is too long (max ${env.maxInputChars} characters).`);

    let bytes = 0;
    for (const m of history) for (const a of m.attachments || []) {
      if (!ALLOWED_MIME.test(a.mime)) throw new ApiError(415, "bad_file", `Unsupported file type: ${a.mime}`);
      if (a.mime === "application/pdf" && env.provider !== "gemini") throw new ApiError(415, "bad_file", "PDF analysis needs the Gemini provider.");
      bytes += ((a.data?.length ?? 0) * 3) / 4;
    }
    if (bytes > env.maxAttachmentMb * 1024 * 1024) throw new ApiError(413, "too_large", `Attachments exceed ${env.maxAttachmentMb} MB.`);

    checkRate(uid, "chat");
    release = acquireInflight(uid);
    await consumeDaily(uid, "requests");

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), env.timeoutMs);
    req.signal.addEventListener("abort", () => ac.abort());

    const enc = new TextEncoder();
    const line = (o: unknown) => enc.encode(JSON.stringify(o) + "\n");
    const done = release;
    release = undefined;

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          let searchContext: string | undefined;
          if (body.useSearch) {
            const r = await webSearch(last.content, ac.signal);
            if (r) {
              searchContext = r.context;
              controller.enqueue(line({ sources: r.sources }));
            }
          }
          const system = systemPrompt({ language: body.language, memory: body.memory, searchContext });
          const msgs: ProviderMessage[] = history.map((m) => ({ role: m.role, content: m.content, attachments: m.attachments }));
          let produced = false;
          for await (const t of streamChat(system, msgs, ac.signal)) {
            produced = true;
            controller.enqueue(line({ t }));
          }
          if (!produced) controller.enqueue(line({ error: { code: "empty", message: "The model returned an empty answer. Try rephrasing." } }));
        } catch (e) {
          if (req.signal.aborted) {
            // user pressed Stop: nothing to report
          } else if (e instanceof ProviderError) {
            controller.enqueue(line({ error: { code: e.code, message: e.message } }));
          } else if (ac.signal.aborted) {
            controller.enqueue(line({ error: { code: "timeout", message: "The AI took too long to respond. Try again." } }));
          } else {
            console.error("[chat stream]", e);
            controller.enqueue(line({ error: { code: "server_error", message: "Something went wrong while generating the answer." } }));
          }
        } finally {
          clearTimeout(timer);
          done();
          try { controller.close(); } catch { /* already closed */ }
        }
      }
    });

    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
  } catch (e) {
    release?.();
    return jsonError(e);
  }
}
