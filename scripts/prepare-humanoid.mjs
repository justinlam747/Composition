// Reduce the CC0 Quaternius asset to a self-contained, static-pose character.
// Usage: node scripts/prepare-humanoid.mjs data/assets/quaternius-source.glb
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { Color } from 'three';

const source = process.argv[2];
if (!source) throw new Error('Supply the original Quaternius AnimationLibrary_Godot_Standard.glb.');
const original = readFileSync(source);
if (original.readUInt32LE(0) !== 0x46546c67 || original.readUInt32LE(4) !== 2) throw new Error('Expected a GLB 2.0 asset.');
const jsonLength = original.readUInt32LE(12);
const gltf = JSON.parse(original.subarray(20, 20 + jsonLength).toString());
const binary = original.subarray(28 + jsonLength);
const idle = gltf.animations.find(animation => animation.name === 'Idle_Loop');
if (!idle) throw new Error('The source is missing Idle_Loop.');

// Bake only the first idle pose into node defaults. No animation player is retained.
for (const channel of idle.channels) {
  const sampler = idle.samplers[channel.sampler];
  const accessor = gltf.accessors[sampler.output];
  const view = gltf.bufferViews[accessor.bufferView];
  const dimensions = { VEC3: 3, VEC4: 4 }[accessor.type];
  if (!dimensions || accessor.componentType !== 5126 || accessor.sparse) throw new Error('Unsupported pose accessor.');
  const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + (sampler.interpolation === 'CUBICSPLINE' ? (view.byteStride ?? dimensions * 4) : 0);
  gltf.nodes[channel.target.node][channel.target.path] = Array.from({ length: dimensions }, (_, i) => binary.readFloatLE(offset + i * 4));
}
delete gltf.animations;

for (const material of gltf.materials) {
  const main = material.name === 'M_Main';
  material.pbrMetallicRoughness = {
    baseColorFactor: [...new Color(main ? '#d8dce2' : '#526f9b').toArray(), 1],
    metallicFactor: main ? .08 : .03,
    roughnessFactor: main ? .5 : .64,
  };
}

const used = new Set();
for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) {
  Object.values(primitive.attributes).forEach(index => used.add(index));
  if (primitive.indices !== undefined) used.add(primitive.indices);
  for (const target of primitive.targets ?? []) Object.values(target).forEach(index => used.add(index));
}
for (const skin of gltf.skins) if (skin.inverseBindMatrices !== undefined) used.add(skin.inverseBindMatrices);
const accessors = [...used].sort((a, b) => a - b);
const accessorMap = new Map(accessors.map((old, index) => [old, index]));
const views = new Set();
for (const index of accessors) {
  const accessor = gltf.accessors[index];
  if (accessor.sparse) throw new Error('Sparse mesh accessors need explicit handling.');
  if (accessor.bufferView !== undefined) views.add(accessor.bufferView);
}
for (const image of gltf.images ?? []) if (image.bufferView !== undefined) views.add(image.bufferView);
const viewList = [...views].sort((a, b) => a - b);
const viewMap = new Map(viewList.map((old, index) => [old, index]));
let length = 0;
const chunks = [];
const compactViews = viewList.map(index => {
  const old = gltf.bufferViews[index];
  if (old.buffer !== 0) throw new Error('Expected one embedded buffer.');
  const bytes = binary.subarray(old.byteOffset ?? 0, (old.byteOffset ?? 0) + old.byteLength);
  const offset = length;
  chunks.push(bytes); length += bytes.length;
  const padding = (4 - length % 4) % 4;
  if (padding) { chunks.push(Buffer.alloc(padding)); length += padding; }
  return { ...old, byteOffset: offset };
});
gltf.accessors = accessors.map(index => {
  const accessor = { ...gltf.accessors[index] };
  if (accessor.bufferView !== undefined) accessor.bufferView = viewMap.get(accessor.bufferView);
  return accessor;
});
for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) {
  for (const key of Object.keys(primitive.attributes)) primitive.attributes[key] = accessorMap.get(primitive.attributes[key]);
  if (primitive.indices !== undefined) primitive.indices = accessorMap.get(primitive.indices);
  for (const target of primitive.targets ?? []) for (const key of Object.keys(target)) target[key] = accessorMap.get(target[key]);
}
for (const skin of gltf.skins) if (skin.inverseBindMatrices !== undefined) skin.inverseBindMatrices = accessorMap.get(skin.inverseBindMatrices);
for (const image of gltf.images ?? []) if (image.bufferView !== undefined) image.bufferView = viewMap.get(image.bufferView);
gltf.bufferViews = compactViews;
gltf.buffers = [{ byteLength: length }];
gltf.asset.copyright = 'Quaternius - CC0 1.0 Universal';
const json = Buffer.from(JSON.stringify(gltf));
const jsonPadding = (4 - json.length % 4) % 4;
const jsonChunk = Buffer.concat([json, Buffer.alloc(jsonPadding, 0x20)]);
const dataChunk = Buffer.concat(chunks);
const header = Buffer.alloc(20);
header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + jsonChunk.length + dataChunk.length, 8);
header.writeUInt32LE(jsonChunk.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
const binaryHeader = Buffer.alloc(8); binaryHeader.writeUInt32LE(dataChunk.length, 0); binaryHeader.writeUInt32LE(0x004e4942, 4);
mkdirSync('public/models', { recursive: true });
writeFileSync('public/models/humanoid.glb', Buffer.concat([header, jsonChunk, binaryHeader, dataChunk]));
console.log(`Bundled humanoid: ${Math.round((28 + jsonChunk.length + dataChunk.length) / 1024)} KB (source ${Math.round(original.length / 1024)} KB).`);
