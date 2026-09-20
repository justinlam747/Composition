import { z } from 'zod';

const coordinate = z.number().finite().min(-1000).max(1000);
export const translationScaleSchema = z.number().finite().min(1).max(10);
export const phoneStateSchema = z.object({ aligned: z.boolean(), recording: z.boolean(),
  paused: z.boolean().optional(), translationScale: translationScaleSchema.optional() }).strict();
export const phonePoseSchema = z.object({
  type: z.literal('pose'), version: z.literal(1),
  seq: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  time: z.number().finite().nonnegative(),
  tracking: z.enum(['normal', 'limited', 'unavailable']),
  position: z.tuple([coordinate, coordinate, coordinate]),
  quaternion: z.tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()])
    .refine(q => Math.abs(Math.hypot(...q) - 1) < .02, 'Expected a unit quaternion'),
}).strict();
const streamId = z.string().uuid();
const candidate = z.object({ candidate: z.string().max(2048), sdpMid: z.string().max(80).nullable(), sdpMLineIndex: z.number().int().min(0).max(16).nullable() }).strict();
const signalBase = { type: z.literal('signal'), version: z.literal(1), streamId };
export const phoneSignalSchema = z.union([
  z.object({ ...signalBase, kind: z.literal('answer'), sdp: z.string().min(1).max(64_000) }).strict(),
  z.object({ ...signalBase, kind: z.literal('candidate'), candidate }).strict(),
]);
export const previewConfigSchema = z.object({ type: z.literal('preview-config'), version: z.literal(1), streamId,
  mode: z.enum(['jpeg', 'webrtc']), fps: z.union([z.literal(30), z.literal(60)]) }).strict();
export const desktopSignalSchema = z.union([
  previewConfigSchema,
  z.object({ type: z.literal('render-stats'), version: z.literal(1), streamId,
    poseHz: z.number().finite().nonnegative(), receiveToRenderMs: z.number().finite().nonnegative().nullable(),
    copyMs: z.number().finite().nonnegative(), captureFps: z.number().finite().nonnegative() }).strict(),
  z.object({ ...signalBase, kind: z.literal('offer'), sdp: z.string().min(1).max(64_000) }).strict(),
  z.object({ ...signalBase, kind: z.literal('candidate'), candidate }).strict(),
]);
const milliseconds = z.number().finite().min(0).max(60_000);
export const phoneDiagnosticsSchema = z.object({ type: z.literal('diagnostics'), version: z.literal(1), streamId,
  fps: z.number().finite().min(0).max(240), dropped: z.number().int().nonnegative().nullable(),
  jitterMs: milliseconds.nullable(), rttMs: milliseconds.nullable(), path: z.string().max(240),
  samples: z.array(milliseconds).max(20), timedOut: z.number().int().min(0).max(20), status: z.string().max(240),
}).strict();
export const phoneMessageSchema = z.union([phonePoseSchema, phoneSignalSchema, phoneDiagnosticsSchema,
  z.object({ type: z.literal('preview-ready'), version: z.literal(1) }).strict(),
  z.object({ type: z.literal('pulse'), version: z.literal(1), streamId, id: z.number().int().min(0).max(65535) }).strict(),
  z.object({ type: z.literal('settings'), translationScale: translationScaleSchema }).strict(),
  z.object({ type: z.literal('control'), action: z.enum(['align', 'record', 'stop', 'pause', 'resume']) }).strict(),
]);
export type PhonePose = z.infer<typeof phonePoseSchema>;
export type PhoneSignal = z.infer<typeof phoneSignalSchema>;
export type DesktopSignal = z.infer<typeof desktopSignalSchema>;
export type PreviewConfig = z.infer<typeof previewConfigSchema>;
export type PhoneDiagnostics = z.infer<typeof phoneDiagnosticsSchema>;
export type PhoneEvent = z.infer<typeof phoneMessageSchema> | { type: 'connection'; connected: boolean } | { type: 'ended' };
export interface PhonePairing { id: string; code: string; addresses: string[]; expiresAt: number }
