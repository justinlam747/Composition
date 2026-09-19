// Test-only adapter. Never imported by the application or enabled by a production environment variable.
import { readFile } from 'node:fs/promises';
import { demoProposal } from '../../src/core/proposals';
import type { Providers } from '../../server/providers';
import { AppError, FileStore } from '../../server/storage';
export const referencePng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=', 'base64');
export function mockProviders(store: FileStore): Providers {
  return {
    configured: { gemini: true, fal: true, hunyuanMotion: true }, model: 'mock-seedance-test-only',
    async image(prompt) { if (prompt === 'FAIL_IMAGE_TEST') throw new AppError(502, 'MOCK_FAILURE', 'Test image generation failed.'); return store.asset(referencePng, 'image/png', 'reference'); },
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
