// Capture mono PCM at 16 kHz without running audio processing on React's thread.
class DirectorMicrophone extends AudioWorkletProcessor {
  constructor() {
    super(); this.phase = 0; this.sum = 0; this.count = 0; this.samples = [];
    this.active = false; this.quiet = 0; this.loud = 0;
  }
  process(inputs) {
    const input = inputs[0]?.[0]; if (!input) return true;
    let energy = 0;
    for (const value of input) {
      energy += value * value;
      this.sum += value; this.count++; this.phase += 16000;
      if (this.phase >= sampleRate) {
        this.phase -= sampleRate;
        this.samples.push(Math.max(-32768, Math.min(32767, Math.round(this.sum / this.count * 32767))));
        this.sum = 0; this.count = 0;
      }
    }
    const loud = Math.sqrt(energy / input.length) > .012;
    this.loud = loud ? this.loud + input.length / sampleRate : 0;
    this.quiet = loud ? 0 : this.quiet + input.length / sampleRate;
    if (!this.active && this.loud > .045) { this.active = true; this.port.postMessage({ type: 'activity', active: true }); }
    if (this.active && this.quiet > .7) { this.active = false; this.port.postMessage({ type: 'activity', active: false }); }
    while (this.samples.length >= 320) {
      const bytes = new ArrayBuffer(640), view = new DataView(bytes);
      this.samples.splice(0, 320).forEach((value, index) => view.setInt16(index * 2, value, true));
      this.port.postMessage({ type: 'audio', bytes }, [bytes]);
    }
    return true;
  }
}
registerProcessor('director-microphone', DirectorMicrophone);
