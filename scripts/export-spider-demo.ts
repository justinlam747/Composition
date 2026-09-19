import { mkdirSync, writeFileSync } from 'node:fs';
import { makeProject, validateProject } from '../src/core/project';
import { loadSpiderDemo, spiderAnimations } from '../src/core/spiderDemo';

const project = loadSpiderDemo({ ...makeProject(), id: 'spider-man-demo-v1' });
project.clips!.forEach((clip, i) => {
  clip.id = `spider-demo-block-${i + 1}`;
  clip.tracks.forEach((track, j) => track.keys.forEach((key, k) => { key.id = `spider-demo-${i}-${j}-${k}`; }));
});
validateProject(project);
mkdirSync('public/demos', { recursive: true });
writeFileSync('public/demos/spider-man.scene.json', JSON.stringify(project, null, 2) + '\n');
writeFileSync('public/demos/spider-man.animations.json', JSON.stringify(spiderAnimations, null, 2) + '\n');
console.log('Saved prepared demo scene and animation library to public/demos.');
