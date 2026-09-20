import { afterEach, describe, expect, it, vi } from 'vitest';
import { directorProviderSchema, parseDirectorResponse } from '../server/directorSchema';
import { liveProviders } from '../server/providers';
import { FileStore } from '../server/storage';
import { makeProject } from '../src/core/project';
import { directorResponseSchema } from '../src/core/director';

describe('Gemini director provider', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it('uses a compact provider schema while keeping application bounds strict', async () => {
    expect(JSON.stringify(directorProviderSchema)).not.toContain('maxItems');
    expect(JSON.stringify(directorProviderSchema)).toContain('create_object');
    expect(JSON.stringify(directorProviderSchema)).not.toContain('"const"');
    expect(directorResponseSchema.safeParse({ kind: 'proposal', message: 'Bad', actions: [{ kind: 'retime_clip', clipId: 'clip', start: 20, duration: 2 }] }).success).toBe(false);
    vi.stubEnv('GEMINI_API_KEY', 'test');
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ kind: 'message', message: 'Pick a point on the floor.' }) }] } }] }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await liveProviders(new FileStore('unused')).director({ sessionId: 'test', project: makeProject(), messages: [{ role: 'user', text: 'A desk' }], text: 'Put it here', image: 'data:image/jpeg;base64,YQ==', context: { time: 0, objectId: null, clipId: null, placement: null } });
    expect(result.kind).toBe('message');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.generationConfig.responseJsonSchema).toEqual(directorProviderSchema);
    expect(body.contents[0].parts[1].inlineData).toEqual({ mimeType: 'image/jpeg', data: 'YQ==' });
  });
  it('rejects incomplete or structurally invalid output without a scene mutation', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{}' }] } }] })));
    await expect(liveProviders(new FileStore('unused')).director({ sessionId: 'test', project: makeProject(), messages: [], text: 'A desk', context: { time: 0, objectId: null, clipId: null, placement: null } })).rejects.toMatchObject({ code: 'INVALID_DIRECTOR_RESPONSE' });
  });
  it('normalizes provider hex spelling without accepting arbitrary CSS or action aliases', () => {
    const value = { kind: 'proposal', message: 'Update desk', actions: [{ kind: 'update_object', objectId: 'desk', geometry: { parts: [{ shape: 'box', position: [0, .5, 0], size: [1, 1, 1], rotation: [0, 0, 0], color: '8B5A2B' }] } }] };
    const result = parseDirectorResponse(JSON.stringify(value));
    expect(result.kind === 'proposal' && result.actions[0].kind === 'update_object' && result.actions[0].geometry?.parts[0].color).toBe('#8B5A2B');
    value.actions[0].geometry.parts[0].color = 'url(evil)'; expect(() => parseDirectorResponse(JSON.stringify(value))).toThrow();
    value.actions[0].kind = 'add_object'; expect(() => parseDirectorResponse(JSON.stringify(value))).toThrow();
  });
});
