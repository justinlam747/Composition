import saved from './generated/spiderAnimations.json';
import { validateAnimation } from './clips';

// Real fal/Hunyuan outputs, retargeted and baked for local demo playback.
// public/demos/spider-man.provenance.json records the original requests and edits.
export const savedSpiderAnimations = saved.map(validateAnimation);
