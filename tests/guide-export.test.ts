import { afterEach, describe, expect, it, vi } from 'vitest';
import { recordCanvas } from '../src/scene/guideExport';

describe('guide export visibility handling', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('pauses while hidden and completes after the tab becomes visible', async () => {
    let hidden = false;
    const listeners = new Map<string, () => void>();
    const paused: boolean[] = [];
    const documentStub = {
      get hidden() { return hidden; },
      addEventListener: (type: string, listener: () => void) => listeners.set(type, listener),
      removeEventListener: (type: string) => listeners.delete(type),
    };
    class FakeRecorder {
      static isTypeSupported() { return true; }
      state: 'inactive' | 'recording' | 'paused' = 'inactive';
      ondataavailable: ((event: { data: Blob }) => void) | undefined;
      onstop: (() => void) | undefined;
      onerror: (() => void) | undefined;
      constructor(public stream: { getTracks: () => { stop: () => void }[] }, public options: { mimeType: string }) {}
      start() { this.state = 'recording'; }
      pause() { paused.push(true); this.state = 'paused'; }
      resume() { paused.push(false); this.state = 'recording'; }
      stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['frame']) }); this.onstop?.(); }
    }
    vi.stubGlobal('document', documentStub);
    vi.stubGlobal('MediaRecorder', FakeRecorder);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 4) as unknown as number);
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));

    const drawTimes: number[] = [];
    const promise = recordCanvas({ captureStream: () => ({ getTracks: () => [{ stop: vi.fn() }] }) } as unknown as HTMLCanvasElement, .08, time => drawTimes.push(time));
    setTimeout(() => { hidden = true; listeners.get('visibilitychange')?.(); }, 10);
    setTimeout(() => { hidden = false; listeners.get('visibilitychange')?.(); }, 45);

    const blob = await promise;
    expect(blob.size).toBeGreaterThan(0);
    expect(paused).toEqual([true, false]);
    expect(drawTimes.at(-1)).toBe(.08);
  });
});
