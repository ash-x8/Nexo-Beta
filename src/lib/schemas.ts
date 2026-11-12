import { z } from "zod";

export const ALLOWED_ATTACHMENT_MIME = /^(image\/(png|jpe?g|webp|gif)|application\/pdf|text\/.*|application\/json)$/;

export const AttachmentSchema = z.object({
  name: z.string().min(1).max(200),
  mime: z.string().min(1).max(100),
  data: z.string().optional(),
  text: z.string().max(200000).optional(),
  size: z.number().int().nonnegative().optional()
});

export const ChatMessageInputSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(40000),
  attachments: z.array(AttachmentSchema).max(4).optional()
});

export const ChatBodySchema = z.object({
  messages: z.array(ChatMessageInputSchema).min(1).max(200),
  language: z.enum(["en", "si", "auto"]).default("auto"),
  responseStyle: z.enum(["balanced", "concise", "detailed"]).default("balanced"),
  nickname: z.string().max(60).optional(),
  customInstructions: z.string().max(400).optional(),
  memory: z.array(z.string().max(300)).max(20).default([]),
  useSearch: z.boolean().default(false),
  model: z.string().max(100).regex(/^[\w.\-:\/]+$/).optional()
});

export const TtsBodySchema = z.object({
  text: z.string().trim().min(1).max(1200)
});

export type ChatBodyInput = z.infer<typeof ChatBodySchema>;
export type TtsBodyInput = z.infer<typeof TtsBodySchema>;
