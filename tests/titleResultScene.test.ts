import {
  describe,
  test,
  assertEqual,
  assertTrue,
  assertFalse,
} from "./runner";
import { TitleScene } from "../src/scenes/TitleScene";
import { ResultScene } from "../src/scenes/ResultScene";
import type { SceneContext, SceneId } from "../src/scenes/Scene";
import { CanvasRenderer } from "../src/renderer/CanvasRenderer";
import { AudioManager, SoundName } from "../src/audio/AudioManager";
import { SaveManager, MemoryProgressStore } from "../src/storage/SaveManager";
import type { MapData } from "../src/data/MapLoader";
import {
  computeMapGridLayout,
  computeResultButtonsLayout,
} from "../src/scenes/SceneLayout";
import type { GameResult } from "../src/scenes/GameScene";

function fakeRenderer(w = 480, h = 800): CanvasRenderer {
  const ctx = new Proxy(
    {
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 0,
      font: "",
      textAlign: "left",
      textBaseline: "top",
    } as unknown as Record<string, unknown>,
    {
      get(target, p) {
        if (p in target) return target[p as string];
        return () => {};
      },
      set(target, p, v) {
        target[p as string] = v;
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  const canvas = {
    width: 0,
    height: 0,
    style: {} as Record<string, string>,
    getContext: () => ctx,
  } as unknown as HTMLCanvasElement;
  const r = new CanvasRenderer(canvas);
  r.resize(w, h, 1);
  return r;
}

function tinyMap(id = 1): MapData {
  return {
    id,
    name: `m${id}`,
    cols: 2,
    rows: 1,
    timeLimit: 10,
    hintCount: 1,
    targetScore: 0,
    initialBoard: [[4, 6]],
  };
}

function makeCtx(): {
  ctx: SceneContext;
  transitions: Array<{ next: SceneId; args: unknown }>;
  audioCalls: SoundName[];
  loadCalls: number[];
} {
  const r = fakeRenderer();
  const audioCalls: SoundName[] = [];
  const audio = new AudioManager({ ctxCtor: null });
  (audio as unknown as { play: (n: SoundName) => void }).play = (n) =>
    audioCalls.push(n);
  (audio as unknown as { ensureReady: () => void }).ensureReady = () => {};
  const transitions: Array<{ next: SceneId; args: unknown }> = [];
  const loadCalls: number[] = [];
  const ctx: SceneContext = {
    renderer: r,
    audio,
    saveManager: new SaveManager(new MemoryProgressStore()),
    transition: (next, args) => transitions.push({ next, args }),
    loadMap: async (id) => {
      loadCalls.push(id);
      return tinyMap(id);
    },
    maxMapId: 10,
  };
  return { ctx, transitions, audioCalls, loadCalls };
}

describe("SceneLayout", () => {
  test("computeMapGridLayout: count만큼 버튼 생성, 모두 뷰포트 안", () => {
    const l = computeMapGridLayout(480, 800, 10);
    assertEqual(l.buttons.length, 10);
    for (const b of l.buttons) {
      assertTrue(b.x >= 0 && b.x + b.width <= 480);
      assertTrue(b.y >= 0 && b.y + b.height <= 800);
    }
  });

  test("computeResultButtonsLayout: 세 버튼이 겹치지 않고 폭 안", () => {
    const l = computeResultButtonsLayout(480, 800);
    assertTrue(l.retry.x + l.retry.width <= l.next.x);
    assertTrue(l.next.x + l.next.width <= l.title.x);
    assertTrue(l.title.x + l.title.width <= 480);
  });
});

describe("TitleScene", () => {
  test("버튼 탭 → loadMap 호출 → transition('game', { map })", async () => {
    const { ctx, transitions, loadCalls } = makeCtx();
    const scene = new TitleScene(ctx);
    scene.enter();
    scene.render();
    const layout = computeMapGridLayout(480, 800, 10);
    const first = layout.buttons[0];
    scene.onPointerDown!(first.x + first.width / 2, first.y + first.height / 2);
    scene.onPointerUp!(first.x + first.width / 2, first.y + first.height / 2);
    // loadMap은 비동기; microtask 2회 기다림
    await Promise.resolve();
    await Promise.resolve();
    assertEqual(loadCalls.length, 1);
    assertEqual(loadCalls[0], 1);
    assertEqual(transitions[transitions.length - 1].next, "game");
  });

  test("버튼 밖에서 up → 전환 없음", () => {
    const { ctx, transitions } = makeCtx();
    const scene = new TitleScene(ctx);
    scene.enter();
    scene.render();
    scene.onPointerDown!(-10, -10);
    scene.onPointerUp!(-10, -10);
    assertEqual(transitions.length, 0);
  });
});

describe("ResultScene", () => {
  function gameResult(id = 3, cleared = true): GameResult {
    return {
      mapId: id,
      mapName: `m${id}`,
      cleared,
      score: 500,
      timeLeft: 30,
    };
  }

  test("retry 버튼: 같은 mapId로 loadMap + game 전환", async () => {
    const { ctx, transitions, loadCalls } = makeCtx();
    const scene = new ResultScene(ctx);
    scene.enter(gameResult(5));
    scene.render();
    const layout = computeResultButtonsLayout(480, 800);
    const b = layout.retry;
    scene.onPointerDown!(b.x + 1, b.y + 1);
    scene.onPointerUp!(b.x + 1, b.y + 1);
    await Promise.resolve();
    await Promise.resolve();
    assertEqual(loadCalls[0], 5);
    assertEqual(transitions[transitions.length - 1].next, "game");
  });

  test("next 버튼: mapId + 1로 로드", async () => {
    const { ctx, loadCalls } = makeCtx();
    const scene = new ResultScene(ctx);
    scene.enter(gameResult(2));
    scene.render();
    const layout = computeResultButtonsLayout(480, 800);
    const b = layout.next;
    scene.onPointerDown!(b.x + 1, b.y + 1);
    scene.onPointerUp!(b.x + 1, b.y + 1);
    await Promise.resolve();
    await Promise.resolve();
    assertEqual(loadCalls[0], 3);
  });

  test("마지막 맵이면 next 비활성 — 클릭 무시", async () => {
    const { ctx, transitions } = makeCtx();
    const scene = new ResultScene(ctx);
    scene.enter(gameResult(10)); // maxMapId == 10
    scene.render();
    const layout = computeResultButtonsLayout(480, 800);
    const b = layout.next;
    scene.onPointerDown!(b.x + 1, b.y + 1);
    scene.onPointerUp!(b.x + 1, b.y + 1);
    await Promise.resolve();
    // retry/next 어느 것도 전환 일으키지 않아야 함
    assertFalse(transitions.some((t) => t.next === "game"));
  });

  test("title 버튼: 타이틀 전환", () => {
    const { ctx, transitions } = makeCtx();
    const scene = new ResultScene(ctx);
    scene.enter(gameResult(1, false));
    scene.render();
    const layout = computeResultButtonsLayout(480, 800);
    const b = layout.title;
    scene.onPointerDown!(b.x + 1, b.y + 1);
    scene.onPointerUp!(b.x + 1, b.y + 1);
    assertEqual(transitions[transitions.length - 1].next, "title");
  });

  test("cleared=true 시 saveManager.saveBest 호출 (최고 점수만 유지)", async () => {
    const { ctx } = makeCtx();
    // 기존 높은 기록 선등록
    await ctx.saveManager.save({
      mapId: 4,
      boardState: [],
      score: 9999,
      timeLeft: 0,
      timestamp: 0,
    });
    const scene = new ResultScene(ctx);
    scene.enter(gameResult(4, true)); // 새 점수 500
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    const rec = await ctx.saveManager.load(4);
    assertEqual(rec?.score, 9999); // 낮은 점수로 덮어쓰지 않아야 함
  });

  test("cleared=false 시 저장하지 않음", async () => {
    const { ctx } = makeCtx();
    const scene = new ResultScene(ctx);
    scene.enter(gameResult(7, false));
    await Promise.resolve();
    await Promise.resolve();
    const rec = await ctx.saveManager.load(7);
    assertEqual(rec, null);
  });
});

describe("TitleScene: 저장된 기록 반영", () => {
  test("enter 시 saveManager.list 로딩 → bestScores 채워짐", async () => {
    const { ctx } = makeCtx();
    await ctx.saveManager.save({
      mapId: 2,
      boardState: [],
      score: 500,
      timeLeft: 30,
      timestamp: 0,
    });
    const scene = new TitleScene(ctx);
    scene.enter();
    // 비동기 reload 대기
    await Promise.resolve();
    await Promise.resolve();
    const best = (scene as unknown as { bestScores: Map<number, number> }).bestScores;
    assertEqual(best.get(2), 500);
  });

  test("제목 화면 재진입 시 기록 재로드", async () => {
    const { ctx } = makeCtx();
    const scene = new TitleScene(ctx);
    scene.enter();
    await Promise.resolve();
    // 이후 저장 발생
    await ctx.saveManager.save({
      mapId: 3,
      boardState: [],
      score: 700,
      timeLeft: 20,
      timestamp: 0,
    });
    // 다시 enter → 재로드
    scene.enter();
    await Promise.resolve();
    await Promise.resolve();
    const best = (scene as unknown as { bestScores: Map<number, number> }).bestScores;
    assertEqual(best.get(3), 700);
  });
});
