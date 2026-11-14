import { ALLOWED_ATTACHMENT_MIME, ChatBodySchema } from "@/lib/schemas";
import { recordSecurityEvent } from "@/server/adminAudit";
import { readEnv } from "@/server/env";
import { ApiError, requireAuthContext } from "@/server/firebaseAdmin";
import {
  acquireInflight,
  checkRate,
  consumeDaily,
  recordGenerationTelemetry,
  recordUsageMetric
} from "@/server/limits";
import { claimRequestId } from "@/server/nexo/healthRegistry";
import { executeUnifiedNexoStream } from "@/server/nexo/orchestrator";
import { ProviderError } from "@/server/providers";
import { getRuntimeConfig, resolveEffectiveFeatures } from "@/server/runtimeConfig";
import { loadRuntimeSecretsIntoOverlay } from "@/server/runtimeSecrets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function jsonError(e: unknown) {
  const err = e instanceof ApiError ? e : new ApiError(500, "server_error", "NEXO encountered a temporary service issue.");
  if (!(e instanceof ApiError)) console.error("[nexo/chat]", e);
  return Response.json({ error: { code: err.code, message: err.message } }, { status: err.status });
}

export async function POST(req: Request) {
  let releaseInflight: (() => void) | undefined;
  let releaseReqId: (() => void) | null = null;

  try {
    const ctx = await requireAuthContext(req);
    const uid = ctx.uid;
    const runtimeCfg = await getRuntimeConfig();
    await loadRuntimeSecretsIntoOverlay(false, runtimeCfg.globalConfig.secretResolutionMode || "runtime_first");
    const e = readEnv();
    const g = runtimeCfg.globalConfig;
    const effectiveFeatures = resolveEffectiveFeatures(runtimeCfg.featureFlags, ctx.featureOverrides);

    if (runtimeCfg.maintenance.enabled && !ctx.isOwner) {
      throw new ApiError(
        503,
        "maintenance",
        runtimeCfg.maintenance.message || "NEXO AI is currently undergoing scheduled maintenance."
      );
    }

    if (!effectiveFeatures.chat) {
      throw new ApiError(403, "feature_disabled", "AI chat is currently disabled by the administrator.");
    }

    const declared = Number(req.headers.get("content-length") || 0);
    if (declared > (g.maxAttachmentMb * 1.45 + 1.5) * 1024 * 1024) {
      throw new ApiError(413, "too_large", "The request payload is too large.");
    }

    const parsed = ChatBodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      throw new ApiError(400, "bad_request", "Invalid chat request.");
    }
    const body = parsed.data;

    const history = body.messages.slice(-g.maxHistoryMessages);
    const last = history[history.length - 1];
    if (!last || last.role !== "user") {
      throw new ApiError(400, "bad_request", "The last message must be from the user.");
    }
    if (!last.content.trim() && !(last.attachments && last.attachments.length > 0)) {
      throw new ApiError(400, "bad_request", "Message cannot be empty.");
    }
    if (last.content.length > g.maxInputChars) {
      throw new ApiError(413, "too_long", `Message is too long (max ${g.maxInputChars} characters).`);
    }

    let attachmentBytes = 0;
    let hasAttachments = false;
    for (const m of history) {
      for (const a of m.attachments || []) {
        hasAttachments = true;
        if (!ALLOWED_ATTACHMENT_MIME.test(a.mime)) {
          throw new ApiError(415, "bad_file", `Unsupported file type: ${a.mime}`);
        }
        if (a.data) {
          attachmentBytes += Math.floor((a.data.length * 3) / 4);
        } else if (a.text) {
          attachmentBytes += Buffer.byteLength(a.text, "utf8");
        }
      }
    }
    if (hasAttachments && !effectiveFeatures.attachments) {
      throw new ApiError(403, "feature_disabled", "File and image attachments are disabled by the administrator.");
    }
    if (attachmentBytes > g.maxAttachmentMb * 1024 * 1024) {
      throw new ApiError(413, "too_large", `Attachments exceed ${g.maxAttachmentMb} MB.`);
    }

    if (body.useSearch && !effectiveFeatures.webSearch) {
      throw new ApiError(403, "feature_disabled", "Web search is currently disabled by the administrator.");
    }

    releaseReqId = claimRequestId(uid, body.requestId);
    if (!releaseReqId) {
      throw new ApiError(409, "duplicate_request", "This request is already being processed.");
    }

    try {
      checkRate(uid, "chat", Date.now(), g.rateLimitPerMinute);
    } catch (rateErr) {
      await recordUsageMetric(uid, "rateLimitHits");
      await recordSecurityEvent({
        type: "rate_limit",
        uid,
        path: "/api/nexo/chat",
        severity: "low",
        reason: (rateErr as Error).message
      });
      throw rateErr;
    }

    releaseInflight = acquireInflight(uid);
    try {
      await consumeDaily(uid, "requests", g.dailyRequestLimit);
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
    const doneInflight = releaseInflight;
    releaseInflight = undefined;
    const doneReqId = releaseReqId;
    releaseReqId = null;

    const effectiveMemory = effectiveFeatures.personalMemory ? body.memory : [];
    const inputCharsTotal = history.reduce((acc, m) => acc + (m.content?.length || 0), 0);

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const enqueue = (obj: unknown) => {
          controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));
        };
        let meta: {
          taskType: string;
          providerUsed: string;
          modelUsed: string;
          outputChars: number;
          failed: boolean;
        } = {
          taskType: "general",
          providerUsed: g.defaultProvider || e.provider,
          modelUsed: g.defaultModel || e.geminiModel,
          outputChars: 0,
          failed: false
        };

        try {
          const res = await executeUnifiedNexoStream({
            uid,
            body,
            runtime: runtimeCfg,
            effectiveMemory,
            allowWebSearch: effectiveFeatures.webSearch,
            reqSignal: req.signal,
            timeoutSignal: ac.signal,
            enqueue
          });
          meta = {
            taskType: res.taskType,
            providerUsed: res.providerUsed,
            modelUsed: res.modelUsed,
            outputChars: res.outputChars,
            failed: res.failed
          };
        } catch (err) {
          meta.failed = true;
          if (req.signal.aborted) {
            // Cancelled intentionally by user
          } else if (err instanceof ProviderError) {
            const safeMsg =
              err.code === "server_config" || err.code === "provider_auth"
                ? "NEXO intelligence service is temporarily unavailable. Please try again shortly."
                : err.message;
            enqueue({ error: { code: err.code, message: safeMsg } });
          } else if (ac.signal.aborted) {
            enqueue({ error: { code: "timeout", message: "NEXO took too long to respond. Please retry." } });
          } else {
            console.error("[nexo/chat stream]", err);
            enqueue({ error: { code: "server_error", message: "Something went wrong while generating the response." } });
          }
        } finally {
          clearTimeout(timer);
          req.signal.removeEventListener("abort", onAbort);
          doneInflight();
          doneReqId?.();
          await recordGenerationTelemetry(uid, {
            provider: meta.providerUsed,
            model: meta.modelUsed,
            inputChars: inputCharsTotal,
            outputChars: meta.outputChars,
            voiceTriggered: Boolean(body.voiceTriggered),
            failed: meta.failed,
            taskType: meta.taskType
          });
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
    releaseInflight?.();
    releaseReqId?.();
    return jsonError(err);
  }
}
