import type { Project } from '../core/project';
type Exporter = () => Promise<{ blob: Blob; project: Project }>;
let exporter: Exporter | undefined;
export function registerGuideExporter(fn: Exporter) { exporter = fn; return () => { if (exporter === fn) exporter = undefined; }; }
export function exportGuide() { if (!exporter) return Promise.reject(new Error('The scene is not ready.')); return exporter(); }

// Real-time browser capture. The renderer supplies a clean view at each timeline time.
export function recordCanvas(canvas: HTMLCanvasElement, duration: number, draw: (time: number) => void): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (!globalThis.MediaRecorder || !canvas.captureStream) { reject(new Error('Guide export needs a browser with canvas recording, such as Chrome or Edge.')); return; }
    const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/mp4'].find(type => MediaRecorder.isTypeSupported(type));
    if (!mimeType) { reject(new Error('This browser has no supported video recorder.')); return; }
    const stream = canvas.captureStream(30), chunks: Blob[] = [];
    let recorder: MediaRecorder;
    try { recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 }); }
    catch (error) { stream.getTracks().forEach(t => t.stop()); reject(error); return; }
    let frame = 0, failed: Error | undefined, timer: ReturnType<typeof setTimeout>, startedAt = 0, hiddenAt = 0, hiddenMs = 0;
    function cleanup() { cancelAnimationFrame(frame); clearTimeout(timer); document.removeEventListener('visibilitychange', visibility); stream.getTracks().forEach(t => t.stop()); }
    function fail(message: string) { failed = new Error(message); if (recorder.state !== 'inactive') recorder.stop(); else { cleanup(); reject(failed); } }
    function activeSeconds() { return (performance.now() - startedAt - hiddenMs) / 1000; }
    function scheduleTimeout() {
      timer = setTimeout(() => {
        if (failed) return;
        if (document.hidden) { scheduleTimeout(); return; }
        if (activeSeconds() >= duration + 15) fail('Guide export timed out. Please try again.'); else scheduleTimeout();
      }, 1000);
    }
    function visibility() {
      if (document.hidden) {
        hiddenAt = performance.now(); cancelAnimationFrame(frame);
        if (recorder.state === 'recording') recorder.pause();
      } else if (hiddenAt) {
        hiddenMs += performance.now() - hiddenAt; hiddenAt = 0;
        if (recorder.state === 'paused') recorder.resume();
        if (!failed) frame = requestAnimationFrame(tick);
      }
    }
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recorder.onerror = () => fail('The browser could not record this guide. Please try again.');
    recorder.onstop = () => { cleanup(); const blob = new Blob(chunks, { type: mimeType }); failed ? reject(failed) : blob.size ? resolve(blob) : reject(new Error('The guide recording was empty.')); };
    document.addEventListener('visibilitychange', visibility);
    function tick() {
      if (failed || document.hidden) return;
      try { const time = Math.min(duration, activeSeconds()); draw(time); if (time >= duration) recorder.stop(); else frame = requestAnimationFrame(tick); }
      catch { fail('The scene could not be rendered during export.'); }
    }
    try {
      draw(0); recorder.start(250); startedAt = performance.now(); scheduleTimeout();
      frame = requestAnimationFrame(tick);
    } catch { fail('The browser could not start guide recording.'); }
  });
}
