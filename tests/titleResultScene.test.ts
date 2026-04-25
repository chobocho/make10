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
  const gradient = { addColorStop() {} };
  const ctx = new Proxy(
    {
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 0,
      font: "",
      textAlign: "left",
      textBaseline: "top",
      createLinearGradient: () => gradient,
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
    starThresholds: [50, 150, 300],
    initialBoard: [[4, 6]],
  };
}

function makeCtx(maxMapId = 10): {
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
    maxMapId,
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

  test("100개 맵: 콘텐츠 높이가 뷰포트 초과 → maxScrollY > 0", () => {
    const { ctx } = makeCtx(100);
    const scene = new TitleScene(ctx);
    scene.enter();
    scene.render();
    assertTrue(scene._getMaxScrollY() > 0);
  });

  test("드래그로 스크롤: 임계값 넘기면 scrollY 증가 + 버튼 탭 취소", async () => {
    const { ctx, transitions } = makeCtx(100);
    const scene = new TitleScene(ctx);
    scene.enter();
    scene.render();
    const grid = computeMapGridLayout(480, 800, ctx.maxMapId);
    const first = grid.buttons[0];
    const sx = first.x + first.width / 2;
    const sy = first.y + first.height / 2;
    scene.onPointerDown!(sx, sy);
    scene.onPointerMove!(sx, sy - 50);
    assertTrue(scene._getScrollY() > 0);
    scene.onPointerUp!(sx, sy - 50);
    await Promise.resolve();
    assertEqual(transitions.length, 0);
  });

  test("드래그 없이 탭: 기존처럼 맵 로드", async () => {
    const { ctx, loadCalls } = makeCtx(100);
    const scene = new TitleScene(ctx);
    scene.enter();
    scene.render();
    const grid = computeMapGridLayout(480, 800, ctx.maxMapId);
    const first = grid.buttons[0];
    const sx = first.x + first.width / 2;
    const sy = first.y + first.height / 2;
    scene.onPointerDown!(sx, sy);
    scene.onPointerMove!(sx + 2, sy + 3);
    scene.onPointerUp!(sx + 2, sy + 3);
    await Promise.resolve();
    await Promise.resolve();
    assertEqual(loadCalls[0], 1);
  });

  test("스크롤 후 버튼 탭: 로지컬 좌표로 정확히 히트 (페이저 영역 아래)", async () => {
    const { ctx, loadCalls } = makeCtx(100);
    // 페이저 고정 후 스크롤 500px 했을 때도 페이저 영역 밖에 떨어지는 idx=24(mapId=25) 사용.
    for (let id = 1; id <= 24; id++) {
      await ctx.saveManager.save({
        mapId: id,
        boardState: [],
        score: 100,
        stars: 1,
        timeLeft: 30,
        timestamp: 0,
      });
    }
    const scene = new TitleScene(ctx);
    scene.enter();
    await Promise.resolve();
    await Promise.resolve();
    scene.render();
    scene._scrollBy(500);
    const scrolled = scene._getScrollY();
    assertTrue(scrolled > 0);
    const grid = computeMapGridLayout(480, 800, 100); // 페이지 1 = 100개
    const cols = 4;
    const targetIdx = cols * 6; // idx=24, mapId=25
    const target = grid.buttons[targetIdx];
    const visibleY = target.y - scrolled;
    // 페이저 영역(헤더 고정) 아래에 떨어져야 한다.
    assertTrue(visibleY > grid.pagerY + grid.pagerHeight);
    scene.onPointerDown!(target.x + target.width / 2, visibleY + target.height / 2);
    scene.onPointerUp!(target.x + target.width / 2, visibleY + target.height / 2);
    await Promise.resolve();
    await Promise.resolve();
    assertEqual(loadCalls[0], targetIdx + 1);
  });
});

describe("ResultScene", () => {
  function gameResult(id = 3, cleared = true): GameResult {
    return {
      mapId: id,
      mapName: `m${id}`,
      cleared,
      score: 500,
      stars: cleared ? 1 : 0,
      timeLeft: 30,
      reason: cleared ? "cleared" : "timeup",
      starThresholds: [100, 1000, 2000],
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

describe("TitleScene: 레벨 순차 잠금", () => {
  test("최초 진입: map 1만 잠금 해제, 나머지는 잠금", async () => {
    const { ctx } = makeCtx(10);
    const scene = new TitleScene(ctx);
    scene.enter();
    await Promise.resolve();
    await Promise.resolve();
    assertTrue(scene._isMapUnlocked(1));
    assertFalse(scene._isMapUnlocked(2));
    assertFalse(scene._isMapUnlocked(10));
  });

  test("map 2 클리어(★1+) → map 3 잠금 해제", async () => {
    const { ctx } = makeCtx(10);
    await ctx.saveManager.save({
      mapId: 1,
      boardState: [],
      score: 100,
      stars: 2,
      timeLeft: 30,
      timestamp: 0,
    });
    await ctx.saveManager.save({
      mapId: 2,
      boardState: [],
      score: 100,
      stars: 1,
      timeLeft: 30,
      timestamp: 0,
    });
    const scene = new TitleScene(ctx);
    scene.enter();
    await Promise.resolve();
    await Promise.resolve();
    assertTrue(scene._isMapUnlocked(1));
    assertTrue(scene._isMapUnlocked(2));
    assertTrue(scene._isMapUnlocked(3));
    assertFalse(scene._isMapUnlocked(4));
  });

  test("stars=0 기록은 클리어로 간주하지 않음 → 다음 맵 잠금 유지", async () => {
    const { ctx } = makeCtx(10);
    await ctx.saveManager.save({
      mapId: 1,
      boardState: [],
      score: 10,
      stars: 0,
      timeLeft: 0,
      timestamp: 0,
    });
    const scene = new TitleScene(ctx);
    scene.enter();
    await Promise.resolve();
    await Promise.resolve();
    assertFalse(scene._isMapUnlocked(2));
  });

  test("잠긴 맵 버튼 탭 → loadMap/transition 호출 안 함", async () => {
    const { ctx, transitions, loadCalls } = makeCtx(10);
    const scene = new TitleScene(ctx);
    scene.enter();
    await Promise.resolve();
    scene.render();
    const layout = computeMapGridLayout(480, 800, 10);
    // index 1 = mapId 2 (잠금 상태)
    const locked = layout.buttons[1];
    scene.onPointerDown!(locked.x + locked.width / 2, locked.y + locked.height / 2);
    scene.onPointerUp!(locked.x + locked.width / 2, locked.y + locked.height / 2);
    await Promise.resolve();
    await Promise.resolve();
    assertEqual(loadCalls.length, 0);
    assertEqual(transitions.length, 0);
  });
});

describe("TitleScene: 페이지 기반 네비게이션", () => {
  test("페이지 잠금: 초기에는 1페이지만 열려있고 2/3은 잠금", async () => {
    const { ctx } = makeCtx(300);
    const scene = new TitleScene(ctx);
    scene.enter();
    await Promise.resolve();
    await Promise.resolve();
    assertTrue(scene._isPageUnlocked(1));
    assertFalse(scene._isPageUnlocked(2));
    assertFalse(scene._isPageUnlocked(3));
  });

  test("map 100 ★≥1 클리어 → 페이지 2 열림", async () => {
    const { ctx } = makeCtx(300);
    await ctx.saveManager.save({
      mapId: 100,
      boardState: [],
      score: 1500,
      stars: 1,
      timeLeft: 0,
      timestamp: 0,
    });
    const scene = new TitleScene(ctx);
    scene.enter();
    await Promise.resolve();
    await Promise.resolve();
    assertTrue(scene._isPageUnlocked(2));
    assertFalse(scene._isPageUnlocked(3));
  });

  test("map 200 ★≥1 클리어 → 페이지 3 열림", async () => {
    const { ctx } = makeCtx(300);
    await ctx.saveManager.save({
      mapId: 200,
      boardState: [],
      score: 1500,
      stars: 1,
      timeLeft: 0,
      timestamp: 0,
    });
    const scene = new TitleScene(ctx);
    scene.enter();
    await Promise.resolve();
    await Promise.resolve();
    assertTrue(scene._isPageUnlocked(3));
  });

  test("화살표 탭: 잠긴 페이지로 이동 시도 → 페이지 변하지 않음", async () => {
    const { ctx } = makeCtx(300);
    const scene = new TitleScene(ctx);
    scene.enter();
    await Promise.resolve();
    await Promise.resolve();
    scene.render();
    const layout = computeMapGridLayout(480, 800, 100);
    const next = layout.nextArrow;
    scene.onPointerDown!(next.x + next.width / 2, next.y + next.height / 2);
    scene.onPointerUp!(next.x + next.width / 2, next.y + next.height / 2);
    assertEqual(scene._getPage(), 1);
  });

  test("화살표 탭: 잠금 해제된 페이지로 이동", async () => {
    const { ctx } = makeCtx(300);
    await ctx.saveManager.save({
      mapId: 100,
      boardState: [],
      score: 1500,
      stars: 2,
      timeLeft: 0,
      timestamp: 0,
    });
    const scene = new TitleScene(ctx);
    scene.enter();
    await Promise.resolve();
    await Promise.resolve();
    scene.render();
    const layout = computeMapGridLayout(480, 800, 100);
    const next = layout.nextArrow;
    scene.onPointerDown!(next.x + next.width / 2, next.y + next.height / 2);
    scene.onPointerUp!(next.x + next.width / 2, next.y + next.height / 2);
    assertEqual(scene._getPage(), 2);
  });

  test("페이지 2에서 첫 카드 탭 → mapId 101 로드 (단, 100을 ★1+로 깸)", async () => {
    const { ctx, loadCalls } = makeCtx(300);
    // 페이지 2에 진입하려면 100 클리어, 페이지 2의 첫 맵 101도 100 클리어로 자동 해제.
    await ctx.saveManager.save({
      mapId: 100,
      boardState: [],
      score: 1500,
      stars: 1,
      timeLeft: 0,
      timestamp: 0,
    });
    const scene = new TitleScene(ctx);
    scene.enter();
    await Promise.resolve();
    await Promise.resolve();
    scene._setPage(2);
    scene.render();
    const layout = computeMapGridLayout(480, 800, 100); // 페이지 2도 100개
    const first = layout.buttons[0];
    scene.onPointerDown!(first.x + first.width / 2, first.y + first.height / 2);
    scene.onPointerUp!(first.x + first.width / 2, first.y + first.height / 2);
    await Promise.resolve();
    await Promise.resolve();
    assertEqual(loadCalls[0], 101);
  });
});

describe("ResultScene: 미클리어 시 다음 맵 비활성", () => {
  function lostResult(id = 3): GameResult {
    return {
      mapId: id,
      mapName: `m${id}`,
      cleared: false,
      score: 50,
      stars: 0,
      timeLeft: 0,
      reason: "timeup",
      starThresholds: [100, 1000, 2000],
    };
  }

  test("실패 결과: next 버튼 탭 무시 (loadMap 호출 안 함)", async () => {
    const { ctx, loadCalls, transitions } = makeCtx(10);
    const scene = new ResultScene(ctx);
    scene.enter(lostResult(3));
    scene.render();
    const layout = computeResultButtonsLayout(480, 800);
    const b = layout.next;
    scene.onPointerDown!(b.x + 1, b.y + 1);
    scene.onPointerUp!(b.x + 1, b.y + 1);
    await Promise.resolve();
    await Promise.resolve();
    assertEqual(loadCalls.length, 0);
    assertFalse(transitions.some((t) => t.next === "game"));
  });
});

describe("TitleScene: 저장된 기록 반영", () => {
  test("enter 시 saveManager.list 로딩 → bestStars 채워짐", async () => {
    const { ctx } = makeCtx();
    await ctx.saveManager.save({
      mapId: 2,
      boardState: [],
      score: 500,
      stars: 2,
      timeLeft: 30,
      timestamp: 0,
    });
    const scene = new TitleScene(ctx);
    scene.enter();
    await Promise.resolve();
    await Promise.resolve();
    const best = (scene as unknown as { bestStars: Map<number, number> }).bestStars;
    assertEqual(best.get(2), 2);
  });

  test("stars 필드 없는 레코드는 0으로 취급", async () => {
    const { ctx } = makeCtx();
    await ctx.saveManager.save({
      mapId: 5,
      boardState: [],
      score: 500,
      timeLeft: 30,
      timestamp: 0,
    });
    const scene = new TitleScene(ctx);
    scene.enter();
    await Promise.resolve();
    await Promise.resolve();
    const best = (scene as unknown as { bestStars: Map<number, number> }).bestStars;
    assertEqual(best.get(5), 0);
  });

  test("제목 화면 재진입 시 기록 재로드", async () => {
    const { ctx } = makeCtx();
    const scene = new TitleScene(ctx);
    scene.enter();
    await Promise.resolve();
    await ctx.saveManager.save({
      mapId: 3,
      boardState: [],
      score: 700,
      stars: 3,
      timeLeft: 20,
      timestamp: 0,
    });
    scene.enter();
    await Promise.resolve();
    await Promise.resolve();
    const best = (scene as unknown as { bestStars: Map<number, number> }).bestStars;
    assertEqual(best.get(3), 3);
  });
});
