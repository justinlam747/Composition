import { z } from 'zod';

const vector = (min: number, max: number) => z.tuple([z.number().finite().min(min).max(max), z.number().finite().min(min).max(max), z.number().finite().min(min).max(max)]);
// Parts use a unit volume centered on X/Z with its base at Y=0.
export const propGeometrySchema = z.object({ parts: z.array(z.object({
  shape: z.enum(['box', 'cylinder', 'sphere']),
  position: vector(-2, 2), size: vector(.005, 2), rotation: vector(-360, 360),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
}).strict()).min(1).max(32) }).strict();
export type PropGeometry = z.infer<typeof propGeometrySchema>;

export function deskGeometry(): PropGeometry {
  return { parts: [
    { shape: 'box', position: [0, .95, 0], size: [1, .1, 1], rotation: [0, 0, 0], color: '#a9784f' },
    ...[-.42, .42].flatMap(x => [-.4, .4].map(z => ({ shape: 'box' as const, position: [x, .45, z] as [number, number, number], size: [.08, .9, .08] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], color: '#45413d' }))),
  ] };
}
