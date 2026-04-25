import { describe, test, assertEqual, assertTrue, assertFalse } from "./runner";
import { EffectLayer } from "../src/renderer/EffectLayer";

function fakeCtx(): CanvasRenderingContext2D {
  const ctx: Record<string, unknown> = {
    globalAlpha: 1,
    fillStyle: "",
    strokeStyle: "",
    font: "",
    lineWidth: 0,
    textAlign: "left",
    textBaseline: "top",
  };
  const noop = (): void => {};
  for (const m of [
    "beginPath",
    "arc",
    "fill",
    "stroke",
    "fillRect",
    "fillText",
    "strokeText",
    "moveTo",
    "lineTo",
    "save",
    "restore",
    "clearRect",
  ]) {
    ctx[m] = noop;
  }
  return ctx as unknown as CanvasRenderingContext2D;
}

const layout = { originX: 0, originY: 0, cellSize: 60 };

function seqRand(values: number[]): () => number {
  let i = 0;
  return () => {
    const v = values[i % values.length];
    i++;
    return v;
  };
}

describe("EffectLayer", () => {
  test("초기 상태: 비활성", () => {
    const e = new EffectLayer(seqRand([0.5]));
    assertFalse(e.hasActive());
    assertEqual(e._size(), 0);
  });

  test("spawnRemoval(pair): 파티클 + 점수 팝업 (이펙트 ≥ 2)", () => {
    const e = new EffectLayer(seqRand([0.5]));
    e.spawnRemoval(
      [
        [0, 0],
        [1, 0],
      ],
      layout,
      "pair",
    );
    assertTrue(e.hasActive());
    // pair: ParticleBurst 1개 + ScorePopup 1개 = 2개
    assertEqual(e._size(), 2);
  });

  test("spawnRemoval(triple): 더 강한 이펙트 (파티클+팝업+링2개 = 4)", () => {
    const e = new EffectLayer(seqRand([0.5]));
    e.spawnRemoval(
      [
        [0, 0],
        [1, 0],
        [2, 0],
      ],
      layout,
      "triple",
    );
    assertTrue(e.hasActive());
    assertEqual(e._size(), 4);
  });

  test("spawnRemoval: 빈 셀 배열은 어떤 이펙트도 만들지 않음", () => {
    const e = new EffectLayer(seqRand([0.5]));
    e.spawnRemoval([], layout, "pair");
    assertFalse(e.hasActive());
  });

  test("update: 충분한 시간이 지나면 이펙트가 모두 만료되어 정리", () => {
    const e = new EffectLayer(seqRand([0.5]));
    e.spawnRemoval(
      [
        [0, 0],
        [1, 0],
      ],
      layout,
      "pair",
    );
    assertTrue(e.hasActive());
    // ScorePopup 720ms + 파티클 ~420*1.2 ≈ 504ms 가 가장 긴 수명. 안전 마진 포함 2초.
    e.update(2000);
    assertFalse(e.hasActive());
    assertEqual(e._size(), 0);
  });

  test("update(0): 시간 미경과 시 상태 변화 없음", () => {
    const e = new EffectLayer(seqRand([0.5]));
    e.spawnRemoval(
      [
        [0, 0],
        [1, 0],
      ],
      layout,
      "pair",
    );
    const before = e._size();
    e.update(0);
    assertEqual(e._size(), before);
  });

  test("clear: 즉시 모든 이펙트 제거", () => {
    const e = new EffectLayer(seqRand([0.5]));
    e.spawnRemoval(
      [
        [0, 0],
        [1, 0],
        [2, 0],
      ],
      layout,
      "triple",
    );
    assertTrue(e.hasActive());
    e.clear();
    assertFalse(e.hasActive());
    assertEqual(e._size(), 0);
  });

  test("render: 이펙트가 비어있어도 예외 없이 통과", () => {
    const e = new EffectLayer(seqRand([0.5]));
    e.render(fakeCtx());
  });

  test("render: 활성 이펙트가 있으면 ctx 메서드 호출 (스모크)", () => {
    const e = new EffectLayer(seqRand([0.5]));
    e.spawnRemoval(
      [
        [0, 0],
        [1, 0],
        [2, 0],
      ],
      layout,
      "triple",
    );
    let called = false;
    const ctx = fakeCtx();
    (ctx as unknown as { fill: () => void }).fill = () => {
      called = true;
    };
    e.render(ctx);
    assertTrue(called);
  });

  test("spawnRemoval(pair, chainBonus): 베이스 2개 + 연쇄 배지 1개 = 3", () => {
    const e = new EffectLayer(seqRand([0.5]));
    e.spawnRemoval(
      [
        [0, 0],
        [1, 0],
      ],
      layout,
      "pair",
      { chainBonus: 50, chainDepth: 2 },
    );
    assertEqual(e._size(), 3);
  });

  test("spawnRemoval(triple, chainBonus): 베이스 4개 + 연쇄 배지 1개 = 5", () => {
    const e = new EffectLayer(seqRand([0.5]));
    e.spawnRemoval(
      [
        [0, 0],
        [1, 0],
        [2, 0],
      ],
      layout,
      "triple",
      { chainBonus: 100, chainDepth: 3 },
    );
    assertEqual(e._size(), 5);
  });

  test("chainBonus=0 또는 미지정: 추가 팝업 없음", () => {
    const e = new EffectLayer(seqRand([0.5]));
    e.spawnRemoval(
      [
        [0, 0],
        [1, 0],
      ],
      layout,
      "pair",
      { chainBonus: 0, chainDepth: 1 },
    );
    assertEqual(e._size(), 2);
  });

  test("triple > pair: 파티클 폭발의 활성 시간이 더 김 (이펙트가 늦게 만료)", () => {
    const ePair = new EffectLayer(seqRand([0.5]));
    ePair.spawnRemoval(
      [
        [0, 0],
        [1, 0],
      ],
      layout,
      "pair",
    );
    const eTriple = new EffectLayer(seqRand([0.5]));
    eTriple.spawnRemoval(
      [
        [0, 0],
        [1, 0],
        [2, 0],
      ],
      layout,
      "triple",
    );
    // pair 가장 긴 수명 ≈ 720ms (popup), triple ≈ 950ms (popup) → 800ms 시점에서
    // pair 는 모두 만료, triple 는 아직 활성.
    ePair.update(800);
    eTriple.update(800);
    assertFalse(ePair.hasActive());
    assertTrue(eTriple.hasActive());
  });
});
