import { z } from 'zod';

const coordinate = z.number().finite().min(-1000).max(1000);
export const phonePoseSchema = z.object({
  type: z.literal('pose'), version: z.literal(1),
  seq: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  time: z.number().finite().nonnegative(),
  tracking: z.enum(['normal', 'limited', 'unavailable']),
  position: z.tuple([coordinate, coordinate, coordinate]),
  quaternion: z.tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()])
    .refine(q => Math.abs(Math.hypot(...q) - 1) < .02, 'Expected a unit quaternion'),
}).strict();
export const phoneMessageSchema = z.union([phonePoseSchema,
  z.object({ type: z.literal('control'), action: z.enum(['align', 'record', 'stop']) }).strict(),
]);
export type PhonePose = z.infer<typeof phonePoseSchema>;
export type PhoneEvent = z.infer<typeof phoneMessageSchema> | { type: 'connection'; connected: boolean } | { type: 'ended' };
export interface PhonePairing { id: string; code: string; addresses: string[]; expiresAt: number }
