import type { DesktopSignal, PhoneDiagnostics, PhoneSignal, PreviewConfig } from '../core/phoneProtocol';
import { drawLatencyMarker } from '../core/phoneLatency';

export interface PreviewState {
  mode: PreviewConfig['mode']; fps: 30 | 60; status: string; diagnostics: PhoneDiagnostics | null;
  poseHz: number; receiveToRenderMs: number | null; copyMs: number; captureFps: number;
}
export const initialPreviewState: PreviewState = { mode: 'jpeg', fps: 60, status: 'JPEG baseline · 480×270 · 6 fps', diagnostics: null,
  poseHz: 0, receiveToRenderMs: null, copyMs: 0, captureFps: 0 };

// One renderer supplies pixels to this controller. WebRTC owns encoder/network queues;
// we keep no application frame queue and request only the current canvas image.
export class PhonePreview {
  private canvas = document.createElement('canvas');
  private pc?: RTCPeerConnection;
  private track?: CanvasCaptureMediaStreamTrack;
  private session?: string;
  private ready = false;
  private generation = 0;
  private streamId = '';
  private candidates: RTCIceCandidateInit[] = [];
  private signals: Promise<unknown> = Promise.resolve();
  private inbound: Promise<unknown> = Promise.resolve();
  private statsTimer?: ReturnType<typeof setInterval>;
  private timeout?: ReturnType<typeof setTimeout>;
  private pulseId = 0;
  private at = 0;
  private busy = false;
  private poseCount = 0;
  private frameCount = 0;
  private statsAt = performance.now();
  private receivedAt = 0;
  private poseRendered = true;
  private renderDelays: number[] = [];
  private copyTime = 0;
  private slowWindows = 0;
  private statsSending = false;
  state = { ...initialPreviewState };
  constructor(private changed: (value: PreviewState) => void) { this.canvas.width = 480; this.canvas.height = 270; }
  private update(value: Partial<PreviewState>) { this.state = { ...this.state, ...value }; this.changed(this.state); }
  connect(session: string) { clearInterval(this.statsTimer); this.session = session; this.statsAt = performance.now(); this.statsTimer = setInterval(() => this.stats(), 1000); }
  receiverReady() { this.ready = true; void this.configure(this.state.mode, this.state.fps); }
  private send(value: DesktopSignal, generation = this.generation) {
    const session = this.session;
    const operation = this.signals.catch(() => {}).then(async () => {
      if (!session || session !== this.session || generation !== this.generation) return;
      const response = await fetch(`/api/phone/${session}/signal`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(value), signal: AbortSignal.timeout(4000) });
      if (!response.ok) throw new Error('Preview signaling failed. Retry preview.');
    });
    this.signals = operation;
    return operation;
  }
  private closePeer() {
    clearTimeout(this.timeout); this.pc?.close(); this.pc = undefined; this.track?.stop(); this.track = undefined;
    this.candidates = []; this.pulseId = 0; this.busy = false; this.at = 0; this.slowWindows = 0;
  }
  async configure(mode: PreviewConfig['mode'], fps: 30 | 60 = this.state.fps) {
    const generation = ++this.generation; this.closePeer();
    this.frameCount = 0; this.copyTime = 0; this.renderDelays = []; this.poseCount = 0; this.statsAt = performance.now();
    this.streamId = crypto.randomUUID();
    const streamId = this.streamId;
    this.canvas.width = mode === 'jpeg' ? 480 : 960; this.canvas.height = mode === 'jpeg' ? 270 : 540;
    this.update({ mode, fps, diagnostics: null, status: mode === 'jpeg' ? 'JPEG baseline · 480×270 · 6 fps' : 'Connecting WebRTC…' });
    if (!this.ready || !this.session) return;
    try {
      await this.send({ type: 'preview-config', version: 1, streamId, mode, fps });
      if (generation !== this.generation || mode === 'jpeg') return;
      if (!this.canvas.captureStream || typeof RTCPeerConnection === 'undefined') throw new Error('This browser does not support canvas WebRTC. Use Chrome or Edge.');
      const stream = this.canvas.captureStream(0);
      this.track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
      if (!this.track.requestFrame) { stream.getTracks().forEach(t => t.stop()); throw new Error('Manual canvas capture is unavailable. Use Chrome or Edge.'); }
      const pc = new RTCPeerConnection({ iceServers: [] }); this.pc = pc;
      const transceiver = pc.addTransceiver(this.track, { direction: 'sendonly', streams: [stream], sendEncodings: [{ maxBitrate: 3_000_000, maxFramerate: fps }] });
      const codecs = RTCRtpSender.getCapabilities('video')?.codecs;
      if (codecs && transceiver.setCodecPreferences) transceiver.setCodecPreferences([...codecs.filter(c => c.mimeType === 'video/H264'), ...codecs.filter(c => c.mimeType !== 'video/H264')]);
      pc.onicecandidate = event => {
        if (generation !== this.generation || !event.candidate) return;
        const { candidate, sdpMid, sdpMLineIndex } = event.candidate;
        void this.send({ type: 'signal', version: 1, streamId, kind: 'candidate', candidate: { candidate, sdpMid, sdpMLineIndex } }, generation).catch(error => this.fail(error, generation));
      };
      pc.onconnectionstatechange = () => {
        if (generation !== this.generation) return;
        if (pc.connectionState === 'connected') { clearTimeout(this.timeout); this.update({ status: `WebRTC · 960×540 · ${fps} fps target` }); }
        if (['failed', 'disconnected'].includes(pc.connectionState)) this.fail(new Error('Preview connection lost. Retry preview.'), generation);
      };
      await pc.setLocalDescription(await pc.createOffer());
      if (generation !== this.generation) return;
      await this.send({ type: 'signal', version: 1, streamId, kind: 'offer', sdp: pc.localDescription!.sdp });
      if (generation !== this.generation || pc.connectionState === 'connected') return;
      this.timeout = setTimeout(() => {
        if (pc.connectionState !== 'connected') this.fail(new Error('Preview timed out. Check local-network permission and Wi-Fi; then retry.'), generation);
      }, 15000);
    } catch (error) { this.fail(error, generation); }
  }
  private fail(error: unknown, generation: number) {
    if (generation !== this.generation) return;
    this.closePeer(); this.update({ status: error instanceof Error ? error.message : 'Preview failed. Retry preview.' });
  }
  signal(message: PhoneSignal) {
    const generation = this.generation;
    this.inbound = this.inbound.catch(() => {}).then(async () => {
      const pc = this.pc;
      if (!pc || generation !== this.generation || message.streamId !== this.streamId) return;
      if (message.kind === 'answer') {
        await pc.setRemoteDescription({ type: 'answer', sdp: message.sdp });
        for (const candidate of this.candidates.splice(0)) await pc.addIceCandidate(candidate);
      } else if (pc.remoteDescription) await pc.addIceCandidate(message.candidate);
      else if (this.candidates.length < 64) this.candidates.push(message.candidate);
    }).catch(error => this.fail(error, generation));
  }
  pulse(streamId: string, id: number) { if (streamId === this.streamId) this.pulseId = id; }
  diagnostics(value: PhoneDiagnostics) { if (value.streamId === this.streamId) this.update({ diagnostics: value }); }
  poseReceived() { this.poseCount++; this.receivedAt = performance.now(); this.poseRendered = false; }
  private stats() {
    const now = performance.now(), seconds = (now - this.statsAt) / 1000;
    this.update({ poseHz: this.poseCount / seconds, captureFps: this.frameCount / seconds,
      copyMs: this.frameCount ? this.copyTime / this.frameCount : 0,
      receiveToRenderMs: this.renderDelays.length ? this.renderDelays.reduce((a, b) => a + b, 0) / this.renderDelays.length : null });
    this.poseCount = 0; this.frameCount = 0; this.copyTime = 0; this.renderDelays = []; this.statsAt = now;
    if (this.ready && this.session && !this.statsSending) {
      this.statsSending = true;
      const { poseHz, receiveToRenderMs, copyMs, captureFps } = this.state;
      void this.send({ type: 'render-stats', version: 1, streamId: this.streamId, poseHz, receiveToRenderMs, copyMs, captureFps }).catch(() => {}).finally(() => { this.statsSending = false; });
    }
    // Sustained encoder load: lower the capture target, do not endlessly accumulate work.
    if (this.pc && this.state.fps === 60 && this.state.diagnostics && this.state.diagnostics.fps > 0
      && !this.state.diagnostics.status.startsWith('Measuring') && !this.state.diagnostics.samples.length) {
      this.slowWindows = this.state.diagnostics.fps < 40 ? this.slowWindows + 1 : 0;
      if (this.slowWindows >= 8) void this.configure('webrtc', 30);
    }
  }
  frame(source: HTMLCanvasElement, frame: { x: number; y: number; width: number; height: number }, cssWidth: number, appliedPose: boolean) {
    const now = performance.now();
    if (appliedPose && !this.poseRendered) { this.renderDelays.push(now - this.receivedAt); this.poseRendered = true; }
    if (!this.session || this.busy || now - this.at < (this.state.mode === 'jpeg' ? 160 : 1000 / this.state.fps - 1)) return;
    if (this.state.mode === 'webrtc' && this.pc?.connectionState !== 'connected') return;
    const context = this.canvas.getContext('2d'); if (!context || !cssWidth) return;
    const begin = performance.now(), ratio = source.width / cssWidth;
    context.drawImage(source, frame.x * ratio, frame.y * ratio, frame.width * ratio, frame.height * ratio, 0, 0, this.canvas.width, this.canvas.height);
    if (this.ready) drawLatencyMarker(context, this.pulseId);
    this.copyTime += performance.now() - begin; this.frameCount++; this.at = now;
    if (this.state.mode === 'webrtc') { this.track?.requestFrame(); return; }
    const session = this.session, generation = this.generation; this.busy = true;
    this.canvas.toBlob(blob => {
      if (!blob || session !== this.session || generation !== this.generation) { if (generation === this.generation) this.busy = false; return; }
      void fetch(`/api/phone/${session}/preview`, { method: 'POST', body: blob, signal: AbortSignal.timeout(1500) })
        .catch(() => {}).finally(() => { if (generation === this.generation) this.busy = false; });
    }, 'image/jpeg', .65);
  }
  disconnect() {
    this.generation++; this.closePeer(); clearInterval(this.statsTimer); this.session = undefined; this.ready = false;
    this.poseCount = 0; this.frameCount = 0; this.renderDelays = []; this.update({ ...initialPreviewState });
  }
}
