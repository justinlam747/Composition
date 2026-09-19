import { useSyncExternalStore } from 'react';
import { validateAnimation } from './clips';
import type { AnimationAsset } from './project';
import { savedSpiderAnimations as spiderAnimations } from './savedSpiderAnimations';

const STORAGE = 'composition-animation-library-v1';
function restore(): AnimationAsset[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE) ?? '[]');
    if (!Array.isArray(raw) || raw.length > 50) return [];
    return raw.map(validateAnimation);
  } catch { return []; }
}
let cached = restore();
let assets = [...spiderAnimations, ...cached];
const listeners = new Set<() => void>();
export const animationLibrary = {
  get: () => assets,
  subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
  save(input: AnimationAsset) {
    const asset = validateAnimation(input);
    const next = [...cached.filter(item => item.id !== asset.id), asset];
    if (next.length > 50) throw new Error('The animation library is full. Export it before adding more.');
    try { localStorage.setItem(STORAGE, JSON.stringify(next)); }
    catch { throw new Error('Browser storage is full or unavailable. Save the scene file to keep these keys.'); }
    cached = next; assets = [...spiderAnimations, ...cached]; listeners.forEach(fn => fn());
    return asset;
  },
  import(raw: string) {
    const values = JSON.parse(raw);
    if (!Array.isArray(values) || values.length > 50) throw new Error('Invalid animation library.');
    const checked = values.map(validateAnimation);
    const merged = new Map(cached.map(asset => [asset.id, asset]));
    checked.filter(asset => !spiderAnimations.some(builtin => builtin.id === asset.id)).forEach(asset => merged.set(asset.id, asset));
    if (merged.size > 50) throw new Error('The animation library is full.');
    const next = [...merged.values()];
    localStorage.setItem(STORAGE, JSON.stringify(next)); cached = next; assets = [...spiderAnimations, ...cached]; listeners.forEach(fn => fn());
  },
};
export function useAnimations() { return useSyncExternalStore(animationLibrary.subscribe, animationLibrary.get); }
