// Test-only adapter. Never imported by the application or enabled by a production environment variable.
import { readFile } from 'node:fs/promises';
import { demoProposal } from '../../src/core/proposals';
import type { Providers } from '../../server/providers';
import { AppError, FileStore } from '../../server/storage';
import { deskGeometry } from '../../src/core/propGeometry';
import { uid } from '../../src/core/project';
export const referencePng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=', 'base64');
export function mockProviders(store: FileStore): Providers {
  return {
    configured: { gemini: true, fal: true, hunyuanMotion: true }, model: 'mock-seedance-test-only',
    async director(input) {
      if (input.text === 'FAIL_DIRECTOR_TEST') throw new AppError(502, 'MOCK_FAILURE', 'Test director failed.');
      if (/camera/i.test(input.text)) return { kind: 'proposal', message: 'Place the camera facing the scene.', actions: [{ kind: 'camera_pose', position: [0, 2, 5], rotation: [0, 0, 0] }] };
      if (!input.context.placement) return { kind: 'message', message: 'Click Pick placement point, then click the floor where you want the desk.' };
      return { kind: 'proposal', message: 'Add a 1.4 m wide wooden desk with four legs at your placement marker. Apply this change?', actions: [{ kind: 'create_object', objectId: uid(), spec: { kind: 'box', name: 'Oak desk', dimensions: [1.4, .75, .7], referenceAssetIds: [], geometry: deskGeometry() }, position: input.context.placement, rotation: [0, 0, 0] }] };
    },
    async refinePrompt(_project, _target, prompt) { return { prompt: `${prompt}. Preserve the composition framing, with soft light and consistent material detail.`, intent: 'Suggested warm, tactile treatment.', qualities: { camera: 'Guide framing', distortion: 'Natural perspective', quality: 'Consistent detail', mood: 'Warm', lighting: 'Soft light', texture: 'Tactile surfaces' } }; },
    async image(prompt) { if (prompt.includes('FAIL_IMAGE_TEST')) throw new AppError(502, 'MOCK_FAILURE', 'Test image generation failed.'); return store.asset(Buffer.concat([referencePng, Buffer.from(prompt)]), 'image/png', 'reference'); },
    async propose(project, kind, prompt, objectId) {
      const proposal = demoProposal(project, kind, prompt, objectId); proposal.mode = 'live';
      if (proposal.content.kind === 'object') { proposal.content.object.name = 'Test oak plinth'; proposal.content.object.referenceAssetIds = [(await store.asset(referencePng, 'image/png', 'reference')).id]; }
      if (prompt === 'INVALID_TEST' && proposal.content.kind === 'movement') proposal.content.tracks[0].keys[0].value = [0, NaN, 0];
      return proposal;
    },
    async motion() { throw new AppError(501, 'MOCK_MOTION', 'Motion generation is not used by this fixture.'); },
    async submit(job) { if (job.prompt === 'FAIL_TEST') throw new AppError(502, 'MOCK_FAILURE', 'Test provider rejected the request.'); return `mock-${job.id}`; },
    async poll(job) { return { status: 'completed', output: await readFile(store.file('assets', job.guideAssetId, 'bin')) }; },
  };
}
