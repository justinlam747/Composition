import type { DirectorMessage } from './director';

export type VoiceStatus = 'off' | 'connecting' | 'listening' | 'speaking' | 'reconnecting';
export interface VoiceEvent { type: string; [key: string]: unknown }
export class DirectorVoice {
  private socket?: WebSocket;
  private audio?: AudioContext;
  private stream?: MediaStream;
  private source?: MediaStreamAudioSourceNode;
  private worklet?: AudioWorkletNode;
  private playback = new Set<AudioBufferSourceNode>();
  private nextAudio = 0;
  private stopped = false;
  private ready = false;
  constructor(private onEvent: (event: VoiceEvent) => void, private status: (status: VoiceStatus) => void, private error: (message: string) => void) {}
  async start(initial: { sessionId: string; messages: DirectorMessage[]; context: string; image?: string }) {
    this.status('connecting');
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !window.AudioWorkletNode) throw new Error('Voice needs Chrome or Edge on localhost or HTTPS. You can still type.');
      this.audio = new AudioContext(); await this.audio.resume();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (this.stopped) { stream.getTracks().forEach(track => track.stop()); return; }
      this.stream = stream;
      stream.getAudioTracks().forEach(track => track.addEventListener('ended', () => { if (!this.stopped) this.fail('The microphone disconnected. Reconnect it or continue typing.'); }));
      await this.audio.audioWorklet.addModule('/director-audio.js');
      if (this.stopped) return;
      this.worklet = new AudioWorkletNode(this.audio, 'director-microphone');
      this.source = this.audio.createMediaStreamSource(stream); this.source.connect(this.worklet); this.worklet.connect(this.audio.destination);
      const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/director/live`); this.socket = socket;
      socket.onopen = () => { if (!this.stopped) socket.send(JSON.stringify({ type: 'start', ...initial })); };
      this.worklet.port.onmessage = ({ data }) => {
        if (!this.ready || this.stopped || socket.readyState !== WebSocket.OPEN) return;
        if (socket.bufferedAmount > 128000) { this.fail('Voice connection is too slow. Restart the microphone or continue typing.'); return; }
        if (data.type === 'audio') socket.send(data.bytes);
        else if (data.type === 'activity') {
          if (data.active) { this.interrupt(); this.onEvent({ type: 'speech-start' }); }
          socket.send(JSON.stringify(data));
        }
      };
      socket.onmessage = event => {
        if (this.stopped) return;
        try {
          const message = JSON.parse(event.data) as VoiceEvent;
          if (message.type === 'ready') { this.ready = true; this.status('listening'); }
          else if (message.type === 'reconnecting') { this.ready = false; this.interrupt(); this.status('reconnecting'); }
          else if (message.type === 'audio' && typeof message.data === 'string') this.play(message.data);
          else if (message.type === 'interrupted') this.interrupt();
          else if (message.type === 'error') this.fail(String(message.message));
          this.onEvent(message);
        } catch { this.fail('Voice returned an unreadable response. Continue typing or reconnect.'); }
      };
      socket.onerror = () => this.fail('Could not connect voice. Check the server and try again.');
      socket.onclose = () => { if (!this.stopped) this.fail('Voice disconnected. Your conversation is kept; reconnect or type.'); };
    } catch (error) {
      if (!this.stopped) this.fail(error instanceof DOMException && error.name === 'NotAllowedError' ? 'Microphone access was denied. Allow it in your browser, or continue typing.' : error instanceof Error ? error.message : 'Could not start the microphone.');
    }
  }
  send(message: unknown) { if (this.ready && this.socket?.readyState === WebSocket.OPEN) { this.socket.send(JSON.stringify(message)); return true; } return false; }
  private play(encoded: string) {
    if (!this.audio) return;
    const raw = atob(encoded), bytes = Uint8Array.from(raw, char => char.charCodeAt(0));
    if (bytes.byteLength % 2 || bytes.byteLength > 2_000_000) throw new Error('Invalid voice audio');
    const view = new DataView(bytes.buffer), buffer = this.audio.createBuffer(1, bytes.length / 2, 24000), channel = buffer.getChannelData(0);
    for (let i = 0; i < channel.length; i++) channel[i] = view.getInt16(i * 2, true) / 32768;
    this.nextAudio = Math.max(this.nextAudio, this.audio.currentTime);
    if (this.nextAudio - this.audio.currentTime > 30) { this.fail('Voice playback fell behind. Restart the microphone.'); return; }
    const source = this.audio.createBufferSource(); source.buffer = buffer; source.connect(this.audio.destination); this.playback.add(source);
    source.onended = () => { this.playback.delete(source); source.disconnect(); if (!this.playback.size && !this.stopped && this.ready) this.status('listening'); };
    source.start(this.nextAudio); this.nextAudio += buffer.duration; this.status('speaking');
  }
  interrupt() { this.playback.forEach(source => { source.onended = null; source.stop(); source.disconnect(); }); this.playback.clear(); this.nextAudio = 0; if (this.ready && !this.stopped) this.status('listening'); }
  private fail(message: string) { if (this.stopped) return; this.error(message); this.stop(); }
  stop() {
    if (this.stopped) return; this.stopped = true; this.ready = false; this.interrupt();
    this.stream?.getTracks().forEach(track => track.stop()); this.worklet?.disconnect(); this.source?.disconnect();
    if (this.worklet) this.worklet.port.onmessage = null;
    void this.audio?.close().catch(() => {}); this.socket?.close(); this.status('off');
  }
}
