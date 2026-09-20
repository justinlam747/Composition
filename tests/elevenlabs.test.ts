import { afterEach, describe, expect, it, vi } from 'vitest';
import { elevenLabsSpeechConfigured, synthesizeDirectorSpeech } from '../server/elevenLabs';

describe('ElevenLabs Director speech', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it('keeps credentials server-side and returns bounded MP3 bytes', async () => {
    vi.stubEnv('ELEVENLABS_API_KEY', 'secret-key'); vi.stubEnv('ELEVENLABS_VOICE_ID', 'voice-id');
    const fetchMock = vi.fn().mockResolvedValue(new Response(Uint8Array.from([1, 2, 3]), { headers: { 'content-type': 'audio/mpeg', 'content-length': '3' } }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(synthesizeDirectorSpeech('Plan the shot.')).resolves.toEqual(Buffer.from([1, 2, 3]));
    expect(elevenLabsSpeechConfigured()).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toContain('/v1/text-to-speech/voice-id/stream?output_format=mp3_44100_128');
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({ 'xi-api-key': 'secret-key' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ text: 'Plan the shot.', model_id: 'eleven_flash_v2_5' });
  });

  it('fails clearly when speech is not configured or the provider returns non-audio', async () => {
    await expect(synthesizeDirectorSpeech('Hello')).rejects.toMatchObject({ code: 'ELEVENLABS_NOT_CONFIGURED', status: 503 });
    vi.stubEnv('ELEVENLABS_API_KEY', 'secret-key'); vi.stubEnv('ELEVENLABS_VOICE_ID', 'voice-id');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not audio', { headers: { 'content-type': 'text/plain' } })));
    await expect(synthesizeDirectorSpeech('Hello')).rejects.toMatchObject({ code: 'ELEVENLABS_INVALID_AUDIO', status: 502 });
  });
});
