import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Texture, TextureLoader } from 'three';
import { retargetHunyuanMotion } from '../src/scene/motionRetarget';
import { buildMannequin } from '../src/scene/mannequin';
import { BONES, fromQuaternion, HUMANOID_ID, makeProject, sampleTrack, toQuaternion, unwrapRotation, validateProject, type AnimationAsset, type Track, type Vec3 } from '../src/core/project';
import { insertClip, validateAnimation } from '../src/core/clips';
import { loadSpiderDemo } from '../src/core/spiderDemo';

// Offline motion import needs skeletons and skin geometry, not FBX textures.
Object.assign(globalThis, { window: { URL } });
TextureLoader.prototype.load = function () { return new Texture(); };
const directory = 'data/spider-man-hunyuan';
const modelBytes = await readFile('public/models/humanoid.glb');
const gltf = await new GLTFLoader().parseAsync(modelBytes.buffer.slice(modelBytes.byteOffset, modelBytes.byteOffset + modelBytes.byteLength), '');
const mannequin = buildMannequin(gltf.scene);
const motions: AnimationAsset[] = [], receipts: unknown[] = [];
const beats = [
  { id: 'drop', name: 'Drop to floor', duration: 2, path: [[0, -2, 3.2], [.55, -2, 0], [2, -2, 0]] },
  { id: 'web', name: 'Shoot web', duration: 1.5, path: [[0, -2, 0], [1.5, -2, 0]], web: { anchor: [0, 5.4, 0] as Vec3, start: .4, end: 1.5 } },
  { id: 'swing', name: 'Swing and land', duration: 5.5, path: [[0, -2, 0], [.6, -1.6, .8], [1.3, -.5, 1.6], [2.2, 1, 1.1], [3.2, 3, 0], [5.5, 3, 0]], web: { anchor: [0, 5.4, 0] as Vec3, start: 0, end: 2.8 } },
];
try {
  for (const beat of beats) {
    const receipt = JSON.parse(await readFile(`${directory}/${beat.id}.request.json`, 'utf8'));
    if (!receipt.file || !receipt.completedAt) throw new Error(`Generate ${beat.id} before retargeting it.`);
    const bytes = await readFile(`${directory}/${receipt.file}`);
    const source = new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const animation = retargetHunyuanMotion(source, mannequin, { id: `spider-${beat.id}-hunyuan-v1`, name: beat.name, duration: beat.duration });
    await writeFile(`${directory}/${beat.id}.retargeted.json`, JSON.stringify(animation, null, 2) + '\n');
    const previous = motions.at(-1);
    // Bake a short transition, leaving all of its keys editable in the timeline.
    if (previous) for (const track of animation.tracks.filter(track => track.target !== 'model')) {
      const end = previous.tracks.find(value => value.target === track.target && value.channel === track.channel)?.keys.at(-1)?.value;
      if (!end) continue;
      for (const key of track.keys) {
        if (key.time >= .3) break;
        const t = key.time / .3, weight = t * t * (3 - 2 * t);
        key.value = unwrapRotation(fromQuaternion(toQuaternion(end).slerp(toQuaternion(key.value), weight)), end);
      }
      for (let i = 1; i < track.keys.length; i++) track.keys[i].value = unwrapRotation(track.keys[i].value, track.keys[i - 1].value);
    }
    const path: Track = { objectId: HUMANOID_ID, target: 'model', channel: 'position', keys: beat.path.map(([time, x, height], index) => ({ id: `path-${index}`, time, value: [x, height, 0], ease: 'smooth' })) };
    const root = animation.tracks.find(track => track.target === 'model' && track.channel === 'position')!;
    for (const key of root.keys) {
      mannequin.root.position.set(0, 0, 0); mannequin.root.quaternion.identity();
      for (const bone of BONES) mannequin.setJointPose(bone.id, sampleTrack(animation.tracks.find(track => track.target === bone.id), key.time, bone.rest));
      const minimum = mannequin.getPartBounds('model').min.y;
      const directed = sampleTrack(path, key.time, [0, 0, 0]);
      key.value = [directed[0], directed[1] - minimum + .003, 0];
    }
    if (beat.web) animation.web = beat.web;
    motions.push(validateAnimation(animation));
    receipts.push({ ...receipt, edits: ['Retargeted onto the editor mannequin', 'Baked 0.3-second pose transitions', 'Editor-authored flight path and web effect', 'Baked mesh-based ground contact'] });
    console.log(`${beat.name}: converted ${animation.tracks.length} editable tracks.`);
  }
  const base = loadSpiderDemo({ ...makeProject(), id: 'spider-man-ai-demo-v1' });
  let project = { ...base, name: 'Spider-Man — Hunyuan Motion', clips: [] } as typeof base;
  let start = 0;
  for (const asset of motions) { project = insertClip(project, asset, HUMANOID_ID, start); start += asset.duration; }
  project.clips!.forEach((clip, index) => { clip.id = `spider-ai-block-${index + 1}`; });
  validateProject(project);
  await mkdir(`${directory}/ready`, { recursive: true });
  await writeFile(`${directory}/ready/spider-man.ai.animations.json`, JSON.stringify(motions, null, 2) + '\n');
  await writeFile(`${directory}/ready/spider-man.ai.scene.json`, JSON.stringify(project, null, 2) + '\n');
  await writeFile(`${directory}/ready/spider-man.ai.provenance.json`, JSON.stringify(receipts, null, 2) + '\n');
  console.log('Saved candidate animations and scene for visual review.');
  if (process.argv.includes('--publish')) {
    await mkdir('src/core/generated', { recursive: true });
    await writeFile('src/core/generated/spiderAnimations.json', JSON.stringify(motions) + '\n');
    await writeFile('public/demos/spider-man.scene.json', JSON.stringify(project, null, 2) + '\n');
    await writeFile('public/demos/spider-man.animations.json', JSON.stringify(motions, null, 2) + '\n');
    await writeFile('public/demos/spider-man.provenance.json', JSON.stringify(receipts, null, 2) + '\n');
    console.log('Published the verified generated animations to the demo files.');
  }
} finally { mannequin.dispose(); }
