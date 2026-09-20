import type { DirectorContext } from '../core/director';
export interface DirectorFrame { image: string; view: NonNullable<DirectorContext['view']> }
let capture: (() => DirectorFrame) | undefined;
export function registerDirectorCapture(callback: () => DirectorFrame) { capture = callback; return () => { if (capture === callback) capture = undefined; }; }
export function captureDirectorFrame() {
  if (!capture) throw new Error('The scene is still loading. Wait a moment, then try again.');
  return capture();
}
