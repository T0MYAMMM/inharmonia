/* global AudioWorkletProcessor, registerProcessor, currentFrame */
/**
 * Microphone capture. Collects the first input channel into blocks of about
 * 23 ms and posts each with the context frame its first sample was captured
 * at, plus its peak, so the main thread can line the take up with the click.
 */
const BLOCK = 1024;

class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(BLOCK);
    this.filled = 0;
    this.startFrame = 0;
    this.port.onmessage = (e) => {
      if (e.data === 'flush' && this.filled) {
        this.post(this.filled);
      }
    };
  }

  post(length) {
    const data = this.buffer.slice(0, length);
    let peak = 0;
    for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(data[i]));
    this.port.postMessage({ frame: this.startFrame, data, peak }, [data.buffer]);
    this.filled = 0;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;
    for (let i = 0; i < channel.length; i++) {
      if (this.filled === 0) this.startFrame = currentFrame + i;
      this.buffer[this.filled++] = channel[i];
      if (this.filled === BLOCK) this.post(BLOCK);
    }
    return true;
  }
}

registerProcessor('inharmonia-capture', CaptureProcessor);
