import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CameraFeed, cameraError } from '../src/scene/cameraFeed';

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
function media() {
  const track = Object.assign(new EventTarget(), { stop: vi.fn(), getSettings: () => ({ deviceId: 'camera-1' }) });
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
  return { track, stream };
}
function video() { return { play: vi.fn().mockResolvedValue(undefined), pause: vi.fn(), srcObject: null } as unknown as HTMLVideoElement; }

describe('local camera lifecycle', () => {
  const getUserMedia = vi.fn();
  beforeEach(() => { getUserMedia.mockReset(); vi.stubGlobal('window', { isSecureContext: true }); vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } }); });
  afterEach(() => vi.unstubAllGlobals());

  it('requests video only and releases the camera and video element on stop', async () => {
    const { stream, track } = media(), element = video(), ended = vi.fn();
    getUserMedia.mockResolvedValue(stream);
    const feed = new CameraFeed(element, ended);
    expect(await feed.start()).toBe(stream);
    expect(getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ audio: false }));
    expect(element.srcObject).toBe(stream);
    feed.stop();
    expect(track.stop).toHaveBeenCalledOnce(); expect(element.srcObject).toBeNull();
    track.dispatchEvent(new Event('ended')); expect(ended).not.toHaveBeenCalled();
  });

  it('closes a camera granted after the user cancels the permission request', async () => {
    const { stream, track } = media(), request = deferred<MediaStream>(), element = video();
    getUserMedia.mockReturnValue(request.promise);
    const feed = new CameraFeed(element, vi.fn()), pending = feed.start();
    feed.stop(); request.resolve(stream);
    expect(await pending).toBeNull(); expect(track.stop).toHaveBeenCalledOnce();
    expect(element.play).not.toHaveBeenCalled(); expect(element.srcObject).toBeNull();
  });

  it('keeps the newer camera when an older permission request resolves later', async () => {
    const old = media(), next = media(), request = deferred<MediaStream>(), element = video();
    getUserMedia.mockReturnValueOnce(request.promise).mockResolvedValueOnce(next.stream);
    const feed = new CameraFeed(element, vi.fn()), pending = feed.start();
    await feed.start('camera-2'); request.resolve(old.stream); await pending;
    expect(element.srcObject).toBe(next.stream); expect(old.track.stop).toHaveBeenCalledOnce();
    expect(next.track.stop).not.toHaveBeenCalled(); feed.stop();
  });

  it('stops a stream when playback fails and reports a device disconnect', async () => {
    const { stream, track } = media(), element = video(), ended = vi.fn();
    getUserMedia.mockResolvedValue(stream);
    vi.mocked(element.play).mockRejectedValueOnce(new Error('Playback failed'));
    const feed = new CameraFeed(element, ended);
    await expect(feed.start()).rejects.toThrow('Playback failed'); expect(track.stop).toHaveBeenCalledOnce();
    await feed.start(); track.dispatchEvent(new Event('ended')); expect(ended).toHaveBeenCalledOnce(); feed.stop();
  });

  it('gives actionable messages for denied access, missing hardware, and insecure origins', async () => {
    expect(cameraError(new DOMException('', 'NotAllowedError'))).toContain('Allow camera access');
    expect(cameraError(new DOMException('', 'NotFoundError'))).toContain('No camera');
    vi.stubGlobal('window', { isSecureContext: false });
    await expect(new CameraFeed(video(), vi.fn()).start()).rejects.toThrow('HTTPS or localhost');
    expect(getUserMedia).not.toHaveBeenCalled();
  });
});
