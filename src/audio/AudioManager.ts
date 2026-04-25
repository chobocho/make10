/**
 * AudioManager — Web Audio API 기반 효과음 재생.
 *
 * 자산(음원 파일)을 번들에 포함하지 않도록 OscillatorNode로 효과음을 합성한다.
 * (CLAUDE.md는 base64 내장도 허용하지만, 본 프로젝트는 외부 런타임 의존성/용량을 최소화하기 위해 합성을 택했다.)
 *
 * 브라우저 자동 재생 정책에 대응해 AudioContext는 지연 생성하며,
 * suspended 상태이면 resume을 시도한다 (최초 사용자 제스처에서 초기화됨).
 */
export type SoundName =
  | "select"
  | "remove"
  | "hint"
  | "invalid"
  | "clear"
  | "gameover"
  | "button"
  | "wild"
  | "bonus";

export interface AudioCtxCtor {
  new (): AudioContext;
}

export interface AudioManagerOptions {
  readonly ctxCtor?: AudioCtxCtor | null;
  readonly volume?: number;
}

interface ToneSpec {
  readonly freqs: readonly number[];
  readonly durationMs: number;
  readonly type: OscillatorType;
  readonly gain: number;
}

const SOUNDS: Readonly<Record<SoundName, ToneSpec>> = {
  select: { freqs: [600, 720], durationMs: 80, type: "sine", gain: 0.25 },
  remove: { freqs: [880, 1180, 1480], durationMs: 220, type: "triangle", gain: 0.35 },
  hint: { freqs: [520, 660, 780, 880], durationMs: 320, type: "sine", gain: 0.3 },
  invalid: { freqs: [220, 160], durationMs: 180, type: "sawtooth", gain: 0.25 },
  clear: { freqs: [523, 659, 784, 1046], durationMs: 520, type: "sine", gain: 0.35 },
  gameover: { freqs: [440, 330, 220], durationMs: 600, type: "sawtooth", gain: 0.3 },
  button: { freqs: [800], durationMs: 50, type: "square", gain: 0.2 },
  wild: { freqs: [660, 880, 1100, 1320], durationMs: 360, type: "sine", gain: 0.32 },
  bonus: { freqs: [523, 698, 880, 1175, 1397], durationMs: 480, type: "triangle", gain: 0.34 },
};

function resolveDefaultCtor(): AudioCtxCtor | null {
  if (typeof globalThis === "undefined") return null;
  const w = globalThis as unknown as {
    AudioContext?: AudioCtxCtor;
    webkitAudioContext?: AudioCtxCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export class AudioManager {
  private readonly ctxCtor: AudioCtxCtor | null;
  private ctx: AudioContext | null;
  private masterGain: GainNode | null;
  private muted: boolean;
  private volume: number;

  constructor(options: AudioManagerOptions = {}) {
    this.ctxCtor = options.ctxCtor ?? resolveDefaultCtor();
    this.ctx = null;
    this.masterGain = null;
    this.muted = false;
    this.volume = clampVolume(options.volume ?? 0.5);
  }

  /** 최초 사용자 제스처에서 호출해 오디오 컨텍스트를 준비한다. 이미 준비됐다면 noop. */
  ensureReady(): void {
    this.getOrCreateContext();
    if (this.ctx && this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
  }

  play(name: SoundName): void {
    if (this.muted) return;
    const ctx = this.getOrCreateContext();
    if (!ctx || !this.masterGain) return;
    if (ctx.state === "suspended") void ctx.resume();

    const spec = SOUNDS[name];
    const now = ctx.currentTime;
    const durationSec = spec.durationMs / 1000;

    const osc = ctx.createOscillator();
    osc.type = spec.type;
    osc.frequency.setValueAtTime(spec.freqs[0], now);
    if (spec.freqs.length > 1) {
      const stepSec = durationSec / spec.freqs.length;
      for (let i = 1; i < spec.freqs.length; i++) {
        osc.frequency.linearRampToValueAtTime(spec.freqs[i], now + stepSec * i);
      }
    }

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(spec.gain, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + durationSec);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + durationSec + 0.05);
  }

  setMuted(m: boolean): void {
    this.muted = m;
  }

  isMuted(): boolean {
    return this.muted;
  }

  setVolume(v: number): void {
    this.volume = clampVolume(v);
    if (this.masterGain) this.masterGain.gain.value = this.volume;
  }

  getVolume(): number {
    return this.volume;
  }

  private getOrCreateContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (!this.ctxCtor) return null;
    try {
      const ctx = new this.ctxCtor();
      const gain = ctx.createGain();
      gain.gain.value = this.volume;
      gain.connect(ctx.destination);
      this.ctx = ctx;
      this.masterGain = gain;
      return ctx;
    } catch {
      return null;
    }
  }
}

function clampVolume(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}
