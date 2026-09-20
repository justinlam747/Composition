import { AppError } from './storage';

const MAX_SPEECH_BYTES = 12_000_000;

export function elevenLabsSpeechConfigured() {
  return Boolean(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID);
}

/** Converts one finalized Director reply to transient MP3 audio. */
export async function synthesizeDirectorSpeech(text: string): Promise<Buffer> {
  const key = process.env.ELEVENLABS_API_KEY, voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!key || !voiceId) throw new AppError(503, 'ELEVENLABS_NOT_CONFIGURED', 'Configure ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID on the server to enable Director speech.');
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream?output_format=mp3_44100_128`, {
    method: 'POST',
    signal: AbortSignal.timeout(60_000),
    headers: { 'Content-Type': 'application/json', 'xi-api-key': key },
    body: JSON.stringify({ text, model_id: process.env.ELEVENLABS_TTS_MODEL || 'eleven_flash_v2_5' }),
  });
  if (!response.ok) throw new AppError(502, 'ELEVENLABS_REQUEST_FAILED', `ElevenLabs could not synthesize this reply (HTTP ${response.status}). Check the voice ID, model access, and quota, then retry.`);
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.startsWith('audio/')) throw new AppError(502, 'ELEVENLABS_INVALID_AUDIO', 'ElevenLabs returned an unexpected response. Check the configured voice and try again.');
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_SPEECH_BYTES) throw new AppError(502, 'ELEVENLABS_AUDIO_TOO_LARGE', 'ElevenLabs returned audio that is too large to play safely. Use a shorter Director reply.');
  const audio = Buffer.from(await response.arrayBuffer());
  if (!audio.length || audio.length > MAX_SPEECH_BYTES) throw new AppError(502, 'ELEVENLABS_INVALID_AUDIO', 'ElevenLabs returned invalid audio. Try the request again.');
  return audio;
}
