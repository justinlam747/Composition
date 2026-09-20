import type { DirectorMessage } from './director';

export type VoiceStatus = 'off' | 'connecting' | 'listening' | 'speaking' | 'reconnecting';
export interface VoiceEvent { type: string; [key: string]: unknown }
export class DirectorVoice {
  private socket?: WebSocket;
  private audio?: AudioContext;
  private stream?: MediaStream;
  private source?: MediaStreamAudioSourceNode;
  private worklet?: AudioWorkletNode;
  private stopped = false;
  private ready = false;
  private demo = false;
  private remoteMuted = false;
  private inputLocked = false;
  private utterance?: SpeechSynthesisUtterance;
  constructor(private onEvent: (event: VoiceEvent) => void, private status: (status: VoiceStatus) => void, private error: (message: string) => void) {}
  async start(initial: { sessionId: string; messages: DirectorMessage[]; context: string; image?: string; demo?: boolean }) {
    this.status('connecting');
    this.demo = !!initial.demo; this.remoteMuted = this.demo;
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
        if (data.type === 'audio') { if (!this.inputLocked) socket.send(data.bytes); }
        else if (data.type === 'activity') {
          if (this.inputLocked) return;
          if (data.active) { this.remoteMuted = this.demo; this.onEvent({ type: 'speech-start' }); }
          socket.send(JSON.stringify(data));
        }
      };
      socket.onmessage = event => {
        if (this.stopped) return;
        try {
          const message = JSON.parse(event.data) as VoiceEvent;
          if (message.type === 'ready') { this.ready = true; this.status('listening'); }
          else if (message.type === 'reconnecting') { this.ready = false; this.status('reconnecting'); }
          else if (message.type === 'error') this.fail(String(message.message));
          const suppressRemoteOutput = this.remoteMuted && (message.type === 'audio' || message.type === 'turn-complete' || message.type === 'transcript' && message.role === 'assistant');
          if (suppressRemoteOutput) return;
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
  setInputLocked(locked: boolean) { this.inputLocked = locked; }
  /** Compatibility fallback for cached demo responses when ElevenLabs is not configured. */
  cachedReply(text: string) {
    this.remoteMuted = true;
    if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) { this.error('Speech is unavailable in this browser. The cached response is still shown in the chat.'); return; }
    const utterance = new SpeechSynthesisUtterance(text); this.utterance = utterance;
    utterance.onstart = () => { if (this.utterance === utterance) this.status('speaking'); };
    utterance.onend = utterance.onerror = () => { if (this.utterance === utterance) { this.utterance = undefined; if (!this.stopped && this.ready) this.status('listening'); } };
    window.speechSynthesis.speak(utterance);
  }
  private fail(message: string) { if (this.stopped) return; this.error(message); this.stop(); }
  stop() {
    if (this.stopped) return; this.stopped = true; this.ready = false; this.inputLocked = false;
    if (this.utterance) { this.utterance = undefined; window.speechSynthesis?.cancel(); }
    this.stream?.getTracks().forEach(track => track.stop()); this.worklet?.disconnect(); this.source?.disconnect();
    if (this.worklet) this.worklet.port.onmessage = null;
    void this.audio?.close().catch(() => {}); this.socket?.close(); this.status('off');
  }
}
