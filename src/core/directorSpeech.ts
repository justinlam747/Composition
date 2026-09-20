import { api } from './api';

export type DirectorSpeechStatus = 'idle' | 'preparing' | 'speaking';

/** Serial, complete-reply playback for Director. Only explicit lifecycle cleanup cancels speech. */
export class DirectorSpeech {
  private queue: string[] = [];
  private current?: HTMLAudioElement;
  private currentUrl?: string;
  private controller?: AbortController;
  private running = false;
  private stopped = false;

  constructor(private onStatus: (status: DirectorSpeechStatus) => void, private onError: (message: string) => void) {}

  enqueue(text: string) {
    const clean = text.trim();
    if (!clean || this.stopped) return;
    this.queue.push(clean); void this.playNext();
  }

  stop() {
    this.stopped = true; this.queue = []; this.controller?.abort(); this.controller = undefined;
    this.current?.pause(); this.current = undefined;
    if (this.currentUrl) URL.revokeObjectURL(this.currentUrl); this.currentUrl = undefined;
    this.running = false; this.onStatus('idle');
  }

  resume() { this.stopped = false; }

  private async playNext() {
    if (this.running || this.stopped) return;
    const text = this.queue.shift(); if (!text) { this.onStatus('idle'); return; }
    this.running = true; this.onStatus('preparing');
    const controller = new AbortController(); this.controller = controller;
    try {
      const blob = await api.directorSpeech(text, controller.signal);
      if (this.stopped || controller.signal.aborted) return;
      const url = URL.createObjectURL(blob), audio = new Audio(url);
      this.currentUrl = url; this.current = audio; this.onStatus('speaking');
      await new Promise<void>((resolve, reject) => {
        audio.onended = () => resolve(); audio.onerror = () => reject(new Error('The generated speech could not be played.'));
        void audio.play().catch(reject);
      });
    } catch (error) {
      if (!controller.signal.aborted && !this.stopped) this.onError(error instanceof Error ? error.message : 'Speech could not be generated.');
    } finally {
      if (this.currentUrl) URL.revokeObjectURL(this.currentUrl); this.currentUrl = undefined; this.current = undefined;
      if (this.controller === controller) this.controller = undefined;
      this.running = false;
      if (!this.stopped) void this.playNext();
    }
  }
}
