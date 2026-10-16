import workletUrl from './capture.worklet.js?url';

/** Why the microphone could not be used, in terms the page can explain. */
export type MicProblem = 'denied' | 'no-device' | 'busy' | 'insecure' | 'unsupported' | 'unknown';

export class MicError extends Error {
  constructor(
    readonly kind: MicProblem,
    message: string,
  ) {
    super(message);
  }
}

/** Map a getUserMedia rejection to what went wrong. */
export function micProblemOf(err: unknown): MicProblem {
  const name = (err as { name?: string } | null)?.name ?? '';
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError')
    return 'denied';
  if (
    name === 'NotFoundError' ||
    name === 'OverconstrainedError' ||
    name === 'DevicesNotFoundError'
  )
    return 'no-device';
  if (name === 'NotReadableError' || name === 'AbortError' || name === 'TrackStartError')
    return 'busy';
  return 'unknown';
}

export interface CaptureBlock {
  /** Context frame of the block's first sample. */
  frame: number;
  data: Float32Array;
  peak: number;
}

const loaded = new WeakSet<BaseAudioContext>();

/**
 * The microphone on the app's AudioContext, captured raw: no echo cancellation,
 * noise suppression or automatic gain, which all bend pitch. Blocks arrive from
 * an AudioWorklet with their context frame, so takes line up with the click.
 */
export class Microphone {
  private listeners = new Set<(b: CaptureBlock) => void>();
  private constructor(
    readonly context: AudioContext,
    private readonly stream: MediaStream,
    private readonly source: MediaStreamAudioSourceNode,
    private readonly node: AudioWorkletNode,
    private readonly sink: GainNode,
  ) {
    node.port.onmessage = (e: MessageEvent<CaptureBlock>) => {
      for (const l of this.listeners) l(e.data);
    };
  }

  static async open(context: AudioContext): Promise<Microphone> {
    if (typeof window !== 'undefined' && window.isSecureContext === false)
      throw new MicError('insecure', 'The microphone needs a secure (https) page.');
    if (!navigator.mediaDevices?.getUserMedia || !context.audioWorklet)
      throw new MicError('unsupported', 'This browser cannot record from the microphone here.');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
        },
      });
    } catch (err) {
      throw new MicError(micProblemOf(err), err instanceof Error ? err.message : String(err));
    }
    if (!stream.getAudioTracks().length) {
      stream.getTracks().forEach((t) => t.stop());
      throw new MicError('no-device', 'No microphone was found.');
    }
    if (!loaded.has(context)) {
      await context.audioWorklet.addModule(workletUrl);
      loaded.add(context);
    }
    const source = context.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(context, 'inharmonia-capture', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 1,
      channelCountMode: 'explicit',
    });
    // The worklet only runs while connected to the output; keep it silent.
    const sink = context.createGain();
    sink.gain.value = 0;
    source.connect(node).connect(sink).connect(context.destination);
    return new Microphone(context, stream, source, node, sink);
  }

  get sampleRate(): number {
    return this.context.sampleRate;
  }

  /** The device's own reported input latency, seconds, where the browser knows it. */
  reportedLatency(): number {
    const s = this.stream.getAudioTracks()[0]?.getSettings() as { latency?: number } | undefined;
    return typeof s?.latency === 'number' ? s.latency : 0;
  }

  /** Name of the input, when the browser shares it. */
  label(): string {
    return this.stream.getAudioTracks()[0]?.label ?? '';
  }

  onBlock(l: (b: CaptureBlock) => void): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  close(): void {
    this.listeners.clear();
    this.node.port.onmessage = null;
    try {
      this.source.disconnect();
      this.node.disconnect();
      this.sink.disconnect();
    } catch {
      /* already disconnected */
    }
    this.stream.getTracks().forEach((t) => t.stop());
  }
}

/** Collects capture blocks into one take, from the first block after `start()`. */
export class TakeBuffer {
  private blocks: CaptureBlock[] = [];
  constructor(readonly sampleRate: number) {}

  add(b: CaptureBlock): void {
    this.blocks.push(b);
  }

  get seconds(): number {
    return this.blocks.reduce((s, b) => s + b.data.length, 0) / this.sampleRate;
  }

  /** The take as one buffer, and the context time of its first sample. */
  finish(): { samples: Float32Array; sampleRate: number; startTime: number } {
    const total = this.blocks.reduce((s, b) => s + b.data.length, 0);
    const samples = new Float32Array(total);
    let at = 0;
    for (const b of this.blocks) {
      samples.set(b.data, at);
      at += b.data.length;
    }
    const startTime = this.blocks.length ? this.blocks[0]!.frame / this.sampleRate : 0;
    return { samples, sampleRate: this.sampleRate, startTime };
  }
}
