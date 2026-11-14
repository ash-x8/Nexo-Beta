import { ApiError, requireUser } from "@/server/firebaseAdmin";
import { acquireInflight, checkRate, consumeDaily, recordUsageMetric } from "@/server/limits";
import { providerConfigured, readEnv } from "@/server/env";
import {
  getFreeFallbackCandidates,
  isFreeEligibleModel,
  markModelHealth
} from "@/server/modelsRegistry";
import {
  activeProvider,
  availableModels,
  isRetryableFallbackError,
  ProviderError,
  streamChat,
  type ProviderMessage
} from "@/server/providers";
import { webSearch } from "@/server/search";
import { systemPrompt } from "@/server/prompt";
import { ALLOWED_ATTACHMENT_MIME, ChatBodySchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function jsonError(e: unknown) {
  const err = e instanceof ApiError ? e : new ApiError(500, "server_error", "Something went wrong on the server.");
  if (!(e instanceof ApiError)) console.error("[chat]", e);
  return Response.json({ error: { code: err.code, message: err.message } }, { status: err.status });
}

export async function POST(req: Request) {
  let release: (() => void) | undefined;
  try {
    if (!providerConfigured()) {
      throw new ApiError(503, "server_config", "The AI provider is not configured on the server yet.");
    }
    const uid = await requireUser(req);
    const e = readEnv();

    // Reject oversized bodies before parsing them (base64 inflates attachments by ~4/3).
    const declared = Number(req.headers.get("content-length") || 0);
    if (declared > (e.maxAttachmentMb * 1.45 + 1.5) * 1024 * 1024) {
      throw new ApiError(413, "too_large", "The request is too large.");
    }

    const parsed = ChatBodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      throw new ApiError(400, "bad_request", "Invalid chat request.");
    }
    const body = parsed.data;

    const history = body.messages.slice(-e.maxHistory);
    const last = history[history.length - 1];
    if (!last || last.role !== "user") {
      throw new ApiError(400, "bad_request", "The last message must be from the user.");
    }
    if (!last.content.trim() && !(last.attachments && last.attachments.length > 0)) {
      throw new ApiError(400, "bad_request", "Message cannot be empty.");
    }
    if (last.content.length > e.maxInputChars) {
      throw new ApiError(413, "too_long", `Message is too long (max ${e.maxInputChars} characters).`);
    }

    const provider = activeProvider();
    let attachmentBytes = 0;
    for (const m of history) {
      for (const a of m.attachments || []) {
        if (!ALLOWED_ATTACHMENT_MIME.test(a.mime)) {
          throw new ApiError(415, "bad_file", `Unsupported file type: ${a.mime}`);
        }
        if (a.mime === "application/pdf" && !provider.supportsPdf) {
          throw new ApiError(415, "bad_file", "PDF analysis requires the Gemini provider.");
        }
        if (a.data) {
          attachmentBytes += Math.floor((a.data.length * 3) / 4);
        } else if (a.text) {
          attachmentBytes += Buffer.byteLength(a.text, "utf8");
        }
      }
    }
    if (attachmentBytes > e.maxAttachmentMb * 1024 * 1024) {
      throw new ApiError(413, "too_large", `Attachments exceed ${e.maxAttachmentMb} MB.`);
    }

    try {
      checkRate(uid, "chat");
    } catch (rateErr) {
      await recordUsageMetric(uid, "rateLimitHits");
      throw rateErr;
    }

    const defaultModel = provider.defaultModel();
    let reportedModels: string[] = [];
    const selectedModel = body.model || defaultModel;

    if (e.freeOnly && !isFreeEligibleModel(selectedModel, provider.id, defaultModel)) {
      throw new ApiError(
        403,
        "paid_model_blocked",
        "Only verified free-tier models are enabled. Choose an available free model."
      );
    }

    if (body.model && body.model !== defaultModel) {
      const vc = new AbortController();
      const vt = setTimeout(() => vc.abort(), 8000);
      try {
        reportedModels = await availableModels(vc.signal);
        if (reportedModels.length > 0 && !reportedModels.includes(body.model) && !isFreeEligibleModel(body.model, provider.id, defaultModel)) {
          throw new ApiError(400, "bad_model", "That model is not available. Choose another free model.");
        }
      } catch (err) {
        if (err instanceof ApiError) throw err;
        throw new ApiError(503, "model_check", "Could not verify the selected model right now. Use the default model or try again.");
      } finally {
        clearTimeout(vt);
      }
    }

    release = acquireInflight(uid);
    try {
      await consumeDaily(uid, "requests");
    } catch (quotaErr) {
      if (quotaErr instanceof ApiError && quotaErr.status === 429) {
        await recordUsageMetric(uid, "rateLimitHits");
      }
      throw quotaErr;
    }

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), e.timeoutMs);
    const onAbort = () => ac.abort();
    req.signal.addEventListener("abort", onAbort, { once: true });

    const enc = new TextEncoder();
    const line = (o: unknown) => enc.encode(JSON.stringify(o) + "\n");
    const done = release;
    release = undefined;

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          let searchContext: string | undefined;
          if (body.useSearch && last.content.trim()) {
            const r = await webSearch(last.content, ac.signal);
            if (r) {
              searchContext = r.context;
              controller.enqueue(line({ sources: r.sources }));
            }
          }

          const system = systemPrompt({
            language: body.language,
            responseStyle: body.responseStyle,
            nickname: body.nickname,
            customInstructions: body.customInstructions,
            memory: body.memory,
            searchContext
          });

          const msgs: ProviderMessage[] = history.map((m) => ({
            role: m.role,
            content: m.content,
            attachments: m.attachments
          }));

          const fallbackCandidates = getFreeFallbackCandidates(
            provider.id,
            selectedModel,
            reportedModels,
            defaultModel
          );
          const attemptQueue = [selectedModel, ...fallbackCandidates];

          let produced = false;
          let lastError: unknown;

          for (let idx = 0; idx < attemptQueue.length; idx++) {
            const candidate = attemptQueue[idx];
            if (e.freeOnly && !isFreeEligibleModel(candidate, provider.id, defaultModel)) {
              continue;
            }

            if (idx > 0) {
              controller.enqueue(
                line({
                  fallback: {
                    from: attemptQueue[idx - 1],
                    to: candidate,
                    reason:
                      lastError instanceof ProviderError ? lastError.code : "provider_unavailable"
                  }
                })
              );
              await recordUsageMetric(uid, "fallbackCount");
            }

            controller.enqueue(
              line({
                meta: {
                  model: candidate,
                  provider: provider.id,
                  freeEligible: isFreeEligibleModel(candidate, provider.id, defaultModel)
                }
              })
            );

            let chunkProduced = false;
            try {
              for await (const t of streamChat(system, msgs, ac.signal, candidate)) {
                if (t) {
                  chunkProduced = true;
                  produced = true;
                  controller.enqueue(line({ t }));
                }
              }
              markModelHealth(candidate, "available");
              break;
            } catch (candidateErr) {
              lastError = candidateErr;
              if (candidateErr instanceof ProviderError) {
                if (candidateErr.code === "provider_rate_limited" || candidateErr.code === "provider_quota") {
                  markModelHealth(candidate, "rate_limited");
                  await recordUsageMetric(uid, "rateLimitHits");
                } else if (candidateErr.code === "provider_model" || candidateErr.code === "provider_unavailable") {
                  markModelHealth(candidate, "unavailable");
                }
              }

              const canFallback =
                !req.signal.aborted &&
                !ac.signal.aborted &&
                !chunkProduced &&
                idx < attemptQueue.length - 1 &&
                isRetryableFallbackError(candidateErr);

              if (!canFallback) {
                throw candidateErr;
              }
            }
          }

          if (!produced) {
            controller.enqueue(
              line({ error: { code: "empty", message: "The model returned an empty answer. Try rephrasing." } })
            );
          } else {
            controller.enqueue(line({ done: true }));
          }
        } catch (err) {
          if (req.signal.aborted) {
            // User cancelled the generation intentionally
          } else if (err instanceof ProviderError) {
            controller.enqueue(line({ error: { code: err.code, message: err.message } }));
          } else if (ac.signal.aborted) {
            controller.enqueue(line({ error: { code: "timeout", message: "The AI took too long to respond. Try again." } }));
          } else {
            console.error("[chat stream]", err);
            controller.enqueue(line({ error: { code: "server_error", message: "Something went wrong while generating the answer." } }));
          }
        } finally {
          clearTimeout(timer);
          req.signal.removeEventListener("abort", onAbort);
          done();
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no"
      }
    });
  } catch (err) {
    release?.();
    return jsonError(err);
  }
}
