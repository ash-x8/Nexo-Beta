import type { Attachment, NexoTaskType } from "@/lib/types";

export interface TaskClassification {
  taskType: NexoTaskType;
  requiresVision: boolean;
  requiresPdf: boolean;
  complexity: "fast" | "standard" | "deep";
  detectedScript: "si" | "ta" | "hi" | "en";
}

export function detectTextScript(text: string): "si" | "ta" | "hi" | "en" {
  if (/[\u0D80-\u0DFF]/.test(text)) return "si";
  if (/[\u0B80-\u0BFF]/.test(text)) return "ta";
  if (/[\u0900-\u097F]/.test(text)) return "hi";
  return "en";
}

/**
 * Lightweight zero-cost deterministic task classifier for NEXO v1 backend routing.
 * Avoids extra AI round-trips so time-to-first-token stays minimal.
 */
export function classifyNexoTask(opts: {
  text: string;
  attachments?: Attachment[];
  useSearch?: boolean;
  voiceTriggered?: boolean;
}): TaskClassification {
  const clean = (opts.text || "").trim();
  const lower = clean.toLowerCase();
  const attachments = opts.attachments || [];

  const requiresVision = attachments.some((a) => a.mime.startsWith("image/"));
  const requiresPdf = attachments.some((a) => a.mime === "application/pdf");
  const hasAudio = attachments.some((a) => a.mime.startsWith("audio/"));
  const detectedScript = detectTextScript(clean);

  if (hasAudio) {
    return {
      taskType: "audioProcessing",
      requiresVision,
      requiresPdf,
      complexity: "standard",
      detectedScript
    };
  }

  if (requiresVision || requiresPdf) {
    return {
      taskType: "imageUnderstanding",
      requiresVision,
      requiresPdf,
      complexity: "standard",
      detectedScript
    };
  }

  if (opts.useSearch) {
    return {
      taskType: "webSearch",
      requiresVision: false,
      requiresPdf: false,
      complexity: "standard",
      detectedScript
    };
  }

  if (opts.voiceTriggered) {
    return {
      taskType: "voiceConversation",
      requiresVision: false,
      requiresPdf: false,
      complexity: "fast",
      detectedScript
    };
  }

  // Image generation intent hint (when user asks to generate/draw/render an image)
  if (
    /^(?:generate|create|draw|design|paint|render|make)\s+(?:an?\s+)?(?:image|picture|photo|illustration|poster|logo|artwork|wallpaper)/i.test(
      lower
    )
  ) {
    return {
      taskType: "imageGen",
      requiresVision: false,
      requiresPdf: false,
      complexity: "standard",
      detectedScript
    };
  }

  // Coding
  if (
    /```|\b(typescript|javascript|python|react|next\.?js|sql|rust|golang|dockerfile|regex|function|component|debug|stack trace|refactor|algorithm|api endpoint)\b/i.test(
      lower
    )
  ) {
    return {
      taskType: "coding",
      requiresVision: false,
      requiresPdf: false,
      complexity: clean.length > 500 ? "deep" : "standard",
      detectedScript
    };
  }

  // Math / quantitative
  if (/\b(prove|theorem|integral|derivative|equation|matrix|probability|calculate|solve for)\b|[=+\-*/^]{2,}/i.test(lower)) {
    return {
      taskType: "math",
      requiresVision: false,
      requiresPdf: false,
      complexity: "deep",
      detectedScript
    };
  }

  // Translation
  if (/\b(translate|in sinhala|to sinhala|in tamil|to tamil|in hindi|to hindi|to english|sinhala meaning)\b/i.test(lower)) {
    return {
      taskType: "translation",
      requiresVision: false,
      requiresPdf: false,
      complexity: "fast",
      detectedScript
    };
  }

  // Summarization
  if (/\b(summarize|summary|tl;dr|key takeaways|bullet points|condense)\b/i.test(lower)) {
    return {
      taskType: "summarization",
      requiresVision: false,
      requiresPdf: false,
      complexity: "fast",
      detectedScript
    };
  }

  // Deep reasoning
  if (
    /\b(analyze|compare|trade[- ]?offs|architecture|strategy|evaluate|critique|step by step|why does|deep dive)\b/i.test(
      lower
    ) ||
    clean.length > 900
  ) {
    return {
      taskType: "reasoning",
      requiresVision: false,
      requiresPdf: false,
      complexity: "deep",
      detectedScript
    };
  }

  // Writing
  if (/\b(write|draft|essay|email|blog|story|poem|cover letter|speech|caption|script)\b/i.test(lower)) {
    return {
      taskType: "writing",
      requiresVision: false,
      requiresPdf: false,
      complexity: "standard",
      detectedScript
    };
  }

  return {
    taskType: "general",
    requiresVision: false,
    requiresPdf: false,
    complexity: clean.length < 120 ? "fast" : "standard",
    detectedScript
  };
}
