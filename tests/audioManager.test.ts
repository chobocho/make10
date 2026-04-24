import {
  describe,
  test,
  assertEqual,
  assertTrue,
  assertFalse,
} from "./runner";
import { AudioManager, SoundName } from "../src/audio/AudioManager";

interface Calls {
  createOscillator: number;
  createGain: number;
  oscillatorStarts: number;
  resume: number;
}

function fakeCtxFactory(calls: Calls) {
  class FakeAudioContext {
    currentTime = 0;
    state: "running" | "suspended" = "suspended";
    destination = {} as unknown;
    createOscillator() {
      calls.createOscillator++;
      const osc = {
        type: "sine" as OscillatorType,
        frequency: {
          setValueAtTime() {},
          linearRampToValueAtTime() {},
        },
        connect() {},
        start() {
          calls.oscillatorStarts++;
        },
        stop() {},
      };
      return osc as unknown as OscillatorNode;
    }
    createGain() {
      calls.createGain++;
      const gain = {
        gain: {
          value: 0,
          setValueAtTime() {},
          linearRampToValueAtTime() {},
          exponentialRampToValueAtTime() {},
        },
        connect() {},
      };
      return gain as unknown as GainNode;
    }
    resume() {
      calls.resume++;
      this.state = "running";
      return Promise.resolve();
    }
  }
  return FakeAudioContext as unknown as new () => AudioContext;
}

describe("AudioManager", () => {
  test("초기 상태: 뮤트 false, volume 기본 0.5", () => {
    const calls: Calls = {
      createOscillator: 0,
      createGain: 0,
      oscillatorStarts: 0,
      resume: 0,
    };
    const am = new AudioManager({ ctxCtor: fakeCtxFactory(calls) });
    assertFalse(am.isMuted());
    assertEqual(am.getVolume(), 0.5);
  });

  test("volume clamp: 1 초과/음수 처리", () => {
    const calls: Calls = {
      createOscillator: 0,
      createGain: 0,
      oscillatorStarts: 0,
      resume: 0,
    };
    const am = new AudioManager({ ctxCtor: fakeCtxFactory(calls), volume: 2 });
    assertEqual(am.getVolume(), 1);
    am.setVolume(-1);
    assertEqual(am.getVolume(), 0);
  });

  test("play: 지연 생성된 컨텍스트에서 오실레이터 생성 + start", () => {
    const calls: Calls = {
      createOscillator: 0,
      createGain: 0,
      oscillatorStarts: 0,
      resume: 0,
    };
    const am = new AudioManager({ ctxCtor: fakeCtxFactory(calls) });
    am.play("remove");
    assertEqual(calls.createOscillator, 1);
    assertEqual(calls.oscillatorStarts, 1);
    // master gain + per-play gain → 최소 2회
    assertTrue(calls.createGain >= 2);
  });

  test("suspended 상태에서 play는 resume 호출", () => {
    const calls: Calls = {
      createOscillator: 0,
      createGain: 0,
      oscillatorStarts: 0,
      resume: 0,
    };
    const am = new AudioManager({ ctxCtor: fakeCtxFactory(calls) });
    am.play("button");
    assertTrue(calls.resume >= 1);
  });

  test("뮤트 시 play 호출되어도 오실레이터 생성 안 됨", () => {
    const calls: Calls = {
      createOscillator: 0,
      createGain: 0,
      oscillatorStarts: 0,
      resume: 0,
    };
    const am = new AudioManager({ ctxCtor: fakeCtxFactory(calls) });
    am.setMuted(true);
    am.play("select");
    assertEqual(calls.createOscillator, 0);
  });

  test("ctxCtor 없으면 play는 noop", () => {
    const am = new AudioManager({ ctxCtor: null });
    am.play("select"); // 에러 없이 지나가야 함
    assertEqual(am.getVolume(), 0.5);
  });

  test("모든 SoundName 재생 가능", () => {
    const calls: Calls = {
      createOscillator: 0,
      createGain: 0,
      oscillatorStarts: 0,
      resume: 0,
    };
    const am = new AudioManager({ ctxCtor: fakeCtxFactory(calls) });
    const names: SoundName[] = [
      "select",
      "remove",
      "hint",
      "invalid",
      "clear",
      "gameover",
      "button",
    ];
    for (const n of names) am.play(n);
    assertEqual(calls.createOscillator, names.length);
  });
});
