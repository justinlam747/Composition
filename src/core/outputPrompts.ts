import { z } from 'zod';

export const promptTargetSchema = z.enum(['video', 'baseline']);
export type PromptTarget = z.infer<typeof promptTargetSchema>;
export const refinedPromptSchema = z.object({
  prompt: z.string().trim().min(1).max(4000),
  intent: z.string().trim().min(1).max(500),
  qualities: z.object({
    camera: z.string().max(300), distortion: z.string().max(300),
    quality: z.string().max(300), mood: z.string().max(300),
    lighting: z.string().max(300), texture: z.string().max(300),
  }),
});
export type RefinedPrompt = z.infer<typeof refinedPromptSchema>;
