export function cameraError(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Camera access was blocked. Allow camera access for this site in your browser, then retry.';
  if (name === 'NotFoundError') return 'No camera was found. Connect a camera and retry.';
  if (name === 'NotReadableError' || name === 'AbortError') return 'The camera could not start. Close other apps using it and retry.';
  if (name === 'OverconstrainedError') return 'That camera is unavailable. Try the default camera.';
  return error instanceof Error ? error.message : 'The camera could not start. Please retry.';
}

/** Owns only the local video stream. Late permission responses cannot reopen a stopped feed. */
export class CameraFeed {
  private revision = 0;
  private stream: MediaStream | null = null;
  constructor(private video: HTMLVideoElement, private onEnded: () => void) {}

  async start(deviceId?: string): Promise<MediaStream | null> {
    this.stop();
    const revision = this.revision;
    if (!window.isSecureContext) throw new Error('Camera access needs HTTPS or localhost. Open this app from a secure address.');
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is unavailable in this browser. Open the app in Chrome, Edge, or Safari.');
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } }), width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    if (revision !== this.revision) { stream.getTracks().forEach(track => track.stop()); return null; }
    this.stream = stream;
    stream.getVideoTracks().forEach(track => track.addEventListener('ended', this.onEnded, { once: true }));
    this.video.srcObject = stream;
    try { await this.video.play(); }
    catch (error) { if (revision !== this.revision) return null; this.stop(); throw error; }
    return revision === this.revision ? stream : null;
  }

  stop() {
    this.revision++;
    this.stream?.getTracks().forEach(track => { track.removeEventListener('ended', this.onEnded); track.stop(); });
    this.stream = null;
    this.video.pause();
    this.video.srcObject = null;
  }
}
