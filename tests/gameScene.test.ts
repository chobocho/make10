import {
  describe,
  test,
  assertEqual,
  assertTrue,
  assertFalse,
} from "./runner";

// assertFalse는 아래에서 사용된다.
void assertFalse;
import { GameScene, GameResult } from "../src/scenes/GameScene";
import type { SceneContext, SceneId } from "../src/scenes/Scene";
import { CanvasRenderer } from "../src/renderer/CanvasRenderer";
import { AudioManager, SoundName } from "../src/audio/AudioManager";
import {
  SaveManager,
  MemoryProgressStore,
  ProgressRecord,
} from "../src/storage/SaveManager";
import type { MapData } from "../src/data/MapLoader";

function makeFakeRenderer(width = 480, height = 800): CanvasRenderer {
  const gradient = { addColorStop() {} };
  const ctx = {
    fillStyle: "",
    font: "",
    textAlign: "left",
    textBaseline: "top",
    fillRect() {},
    strokeRect() {},
    clearRect() {},
    fillText() {},
    setTransform() {},
    save() {},
    restore() {},
    strokeStyle: "",
    lineWidth: 0,
    lineCap: "butt",
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    createLinearGradient: () => gradient,
  } as unknown as CanvasRenderingContext2D;
  const canvas = {
    width: 0,
    height: 0,
    style: {} as Record<string, string>,
    getContext: () => ctx,
  } as unknown as HTMLCanvasElement;
  const r = new CanvasRenderer(canvas);
  r.resize(width, height, 1);
  return r;
}

function makeCtx(renderer: CanvasRenderer): {
  context: SceneContext;
  audioCalls: SoundName[];
  transitions: Array<{ next: SceneId; args: unknown }>;
  saveManager: SaveManager;
} {
  const audioCalls: SoundName[] = [];
  const audio = new AudioManager({ ctxCtor: null });
  (audio as unknown as { play: (n: SoundName) => void }).play = (n: SoundName) => {
    audioCalls.push(n);
  };
  const transitions: Array<{ next: SceneId; args: unknown }> = [];
  const saveManager = new SaveManager(
    new MemoryProgressStore(),
    new MemoryProgressStore(),
  );
  const context: SceneContext = {
    renderer,
    audio,
    saveManager,
    transition: (next, args) => transitions.push({ next, args }),
    loadMap: async () => {
      throw new Error("not used");
    },
    maxMapId: 10,
  };
  return { context, audioCalls, transitions, saveManager };
}

function tinyMap(): MapData {
  return {
    id: 99,
    name: "t",
    cols: 2,
    rows: 1,
    timeLimit: 5,
    hintCount: 1,
    targetScore: 0,
    starThresholds: [50, 150, 300],
    initialBoard: [[4, 6]],
  };
}

describe("GameScene", () => {
  test("enter: 기본 상태 초기화 (점수 0, 미종료)", async () => {
    const r = makeFakeRenderer();
    const { context } = makeCtx(r);
    const scene = new GameScene(context, Math.random, 0);
    await scene.enter({ map: tinyMap() });
    assertEqual(scene._getScore(), 0);
    assertFalse(scene._isEnded());
  });

  test("인트로 오버레이: 기본은 표시됨, 탭하면 해제되고 타이머 시작", async () => {
    const r = makeFakeRenderer();
    const { context } = makeCtx(r);
    const scene = new GameScene(context, Math.random, 2500);
    await scene.enter({ map: tinyMap() });
    assertTrue(scene._isInIntro());
    // 탭해서 인트로 해제
    scene.onPointerDown!(100, 100);
    assertFalse(scene._isInIntro());
    // 이 시점에서 timer.running === true 여야 함
    const timer = (scene as unknown as { timer: { isRunning(): boolean } }).timer;
    assertTrue(timer.isRunning());
  });

  test("인트로 중 update: 시간 경과 시 자동 해제, 타이머 시작", async () => {
    const r = makeFakeRenderer();
    const { context } = makeCtx(r);
    const scene = new GameScene(context, Math.random, 1000);
    await scene.enter({ map: tinyMap() });
    scene.update(500);
    assertTrue(scene._isInIntro());
    scene.update(600);
    assertFalse(scene._isInIntro());
    const timer = (scene as unknown as { timer: { isRunning(): boolean } }).timer;
    assertTrue(timer.isRunning());
  });

  test("인트로 중 보드 선택 불가", async () => {
    const r = makeFakeRenderer();
    const { context, audioCalls } = makeCtx(r);
    const scene = new GameScene(context, Math.random, 5000);
    await scene.enter({ map: tinyMap() });
    scene.render();
    const layout = (scene as unknown as { boardRenderer: { getLayout(): any } }).boardRenderer.getLayout();
    const bx = layout.originX + layout.cellSize / 2;
    const by = layout.originY + layout.cellSize / 2;
    // 인트로 상태에서 down → 인트로만 해제, select 사운드 없음
    scene.onPointerDown!(bx, by);
    assertFalse(audioCalls.includes("select"));
  });

  test("종료 시 GameResult 에 stars + starThresholds 포함", async () => {
    const r = makeFakeRenderer();
    const { context, transitions } = makeCtx(r);
    const scene = new GameScene(context, () => 0, 0);
    await scene.enter({
      map: {
        ...tinyMap(),
        starThresholds: [50, 150, 300],
      },
    });
    scene.render();
    const layout = (scene as unknown as { boardRenderer: { getLayout(): any } }).boardRenderer.getLayout();
    const a = { x: layout.originX + layout.cellSize / 2, y: layout.originY + layout.cellSize / 2 };
    const b = { x: layout.originX + layout.cellSize + layout.cellSize / 2, y: layout.originY + layout.cellSize / 2 };
    scene.onPointerDown!(a.x, a.y);
    scene.onPointerMove!(b.x, b.y);
    scene.onPointerUp!(b.x, b.y);
    // 2x1 + 모두 1 리필 → stuck, 점수 100 → ★★ (≥150 아님, ≥50 맞음 → ★1)
    const res = transitions[transitions.length - 1].args as GameResult;
    assertEqual(res.stars, 1);
    assertTrue(res.cleared);
    assertEqual(res.starThresholds[0], 50);
  });

  test("합 10 드래그 → remove 사운드 + 점수 +100 + 보드 리필로 가득 유지", async () => {
    const r = makeFakeRenderer();
    const { context, audioCalls } = makeCtx(r);
    // RNG=0 → 리필 값은 모두 1 (2x1 맵에서는 1+1=2라 유효 조합 없음 → stuck)
    const scene = new GameScene(context, () => 0, 0);
    await scene.enter({ map: tinyMap() });
    scene.render();
    const layout = (scene as unknown as { boardRenderer: { getLayout(): any } }).boardRenderer.getLayout();
    const cx1 = layout.originX + layout.cellSize / 2;
    const cx2 = layout.originX + layout.cellSize + layout.cellSize / 2;
    const cy = layout.originY + layout.cellSize / 2;
    scene.onPointerDown!(cx1, cy);
    scene.onPointerMove!(cx2, cy);
    scene.onPointerUp!(cx2, cy);
    assertTrue(audioCalls.includes("remove"));
    // 점수 반영
    assertTrue(scene._getScore() >= 100);
    // 보드는 리필되어 여전히 꽉참 (빈 칸 0이 없음)
    const snap = (scene as unknown as { board: { snapshot(): number[][] } }).board.snapshot();
    for (const row of snap) for (const v of row) assertTrue(v !== 0);
  });

  test("타이머 만료 → gameover 전환", async () => {
    const r = makeFakeRenderer();
    const { context, audioCalls, transitions } = makeCtx(r);
    const scene = new GameScene(context, Math.random, 0);
    await scene.enter({ map: { ...tinyMap(), timeLimit: 1 } });
    scene.update(2000);
    assertTrue(scene._isEnded());
    assertTrue(audioCalls.includes("gameover"));
    assertEqual(transitions[transitions.length - 1].next, "result");
    const res = transitions[transitions.length - 1].args as GameResult;
    assertFalse(res.cleared);
  });

  test("일시정지 버튼: press+release 로 pause, 다시 눌러 resume", async () => {
    const r = makeFakeRenderer();
    const { context, audioCalls } = makeCtx(r);
    const scene = new GameScene(context, Math.random, 0);
    await scene.enter({ map: tinyMap() });
    scene.render();
    const pauseBtn = (scene as unknown as {
      uiLayout: { pauseButton: { x: number; y: number; width: number; height: number } };
    }).uiLayout.pauseButton;
    const cx = pauseBtn.x + pauseBtn.width / 2;
    const cy = pauseBtn.y + pauseBtn.height / 2;
    scene.onPointerDown!(cx, cy);
    scene.onPointerUp!(cx, cy);
    assertTrue(scene.isPaused());
    assertTrue(audioCalls.includes("button"));
    // 다시 누르면 resume
    scene.onPointerDown!(cx, cy);
    scene.onPointerUp!(cx, cy);
    assertFalse(scene.isPaused());
  });

  test("일시정지 중: timer.tick / hint.tick 무시", async () => {
    const r = makeFakeRenderer();
    const { context } = makeCtx(r);
    const scene = new GameScene(context, Math.random, 0);
    await scene.enter({ map: { ...tinyMap(), timeLimit: 10 } });
    scene.render();
    scene.pauseGame();
    const timer = (scene as unknown as { timer: { getRemainingMs(): number } }).timer;
    const before = timer.getRemainingMs();
    scene.update(2000);
    assertEqual(timer.getRemainingMs(), before);
  });

  test("일시정지 오버레이 '재개' 버튼 탭 → 재개", async () => {
    const r = makeFakeRenderer();
    const { context } = makeCtx(r);
    const scene = new GameScene(context, Math.random, 0);
    await scene.enter({ map: tinyMap() });
    scene.render();
    scene.pauseGame();
    assertTrue(scene.isPaused());
    const menu = (scene as unknown as {
      pauseMenuLayout: { resume: { x: number; y: number; width: number; height: number } };
    }).pauseMenuLayout;
    const cx = menu.resume.x + menu.resume.width / 2;
    const cy = menu.resume.y + menu.resume.height / 2;
    scene.onPointerDown!(cx, cy);
    scene.onPointerUp!(cx, cy);
    assertFalse(scene.isPaused());
  });

  test("일시정지 오버레이 '다시하기' → 점수/보드 리셋", async () => {
    const r = makeFakeRenderer();
    const { context } = makeCtx(r);
    // RNG=() → 0.5 고정 (리필 값 1+floor(0.5*9)=5). 5가 가득 리필되어도
    // (5,5) 2셀 조합이 가능하므로 stuck 없이 게임 지속.
    const scene = new GameScene(context, () => 0.5, 0);
    await scene.enter({
      map: {
        id: 99,
        name: "restart-test",
        cols: 2,
        rows: 2,
        timeLimit: 60,
        hintCount: 0,
        targetScore: 0,
        starThresholds: [200, 500, 1000],
        initialBoard: [
          [4, 6],
          [5, 5],
        ],
      },
    });
    scene.render();
    const b = (scene as unknown as { boardRenderer: { getLayout(): any } }).boardRenderer.getLayout();
    const a = { x: b.originX + b.cellSize / 2, y: b.originY + b.cellSize / 2 };
    const c = { x: b.originX + b.cellSize + b.cellSize / 2, y: b.originY + b.cellSize / 2 };
    scene.onPointerDown!(a.x, a.y);
    scene.onPointerMove!(c.x, c.y);
    scene.onPointerUp!(c.x, c.y);
    assertTrue(scene._getScore() >= 100);
    assertFalse(scene._isEnded());

    scene.pauseGame();
    const menu = (scene as unknown as {
      pauseMenuLayout: { restart: { x: number; y: number; width: number; height: number } };
    }).pauseMenuLayout;
    const rx = menu.restart.x + menu.restart.width / 2;
    const ry = menu.restart.y + menu.restart.height / 2;
    scene.onPointerDown!(rx, ry);
    scene.onPointerUp!(rx, ry);
    assertEqual(scene._getScore(), 0);
    assertFalse(scene.isPaused());
    assertFalse(scene._isEnded());
  });

  test("일시정지 오버레이 '메인' → title 전환", async () => {
    const r = makeFakeRenderer();
    const { context, transitions } = makeCtx(r);
    const scene = new GameScene(context, Math.random, 0);
    await scene.enter({ map: tinyMap() });
    scene.render();
    scene.pauseGame();
    const menu = (scene as unknown as {
      pauseMenuLayout: { exit: { x: number; y: number; width: number; height: number } };
    }).pauseMenuLayout;
    const ex = menu.exit.x + menu.exit.width / 2;
    const ey = menu.exit.y + menu.exit.height / 2;
    scene.onPointerDown!(ex, ey);
    scene.onPointerUp!(ex, ey);
    assertEqual(transitions[transitions.length - 1].next, "title");
  });

  test("일시정지 중 오버레이 밖(빈 영역) 탭 → 유지", async () => {
    const r = makeFakeRenderer();
    const { context } = makeCtx(r);
    const scene = new GameScene(context, Math.random, 0);
    await scene.enter({ map: tinyMap() });
    scene.render();
    scene.pauseGame();
    assertTrue(scene.isPaused());
    // 어떤 버튼도 히트하지 않는 좌표 (오른쪽 아래 구석 가정)
    scene.onPointerDown!(1, 9999);
    scene.onPointerUp!(1, 9999);
    assertTrue(scene.isPaused());
  });

  test("일시정지 중에는 힌트 버튼 입력 무시", async () => {
    const r = makeFakeRenderer();
    const { context, audioCalls } = makeCtx(r);
    const scene = new GameScene(context, Math.random, 0);
    await scene.enter({ map: tinyMap() });
    scene.render();
    scene.pauseGame();
    const hintBtn = (scene as unknown as {
      uiLayout: { hintButton: { x: number; y: number; width: number; height: number } };
    }).uiLayout.hintButton;
    scene.onPointerDown!(
      hintBtn.x + hintBtn.width / 2,
      hintBtn.y + hintBtn.height / 2,
    );
    scene.onPointerUp!(
      hintBtn.x + hintBtn.width / 2,
      hintBtn.y + hintBtn.height / 2,
    );
    assertFalse(audioCalls.includes("hint"));
  });

  test("인트로 중에는 pauseGame 요청 무시", async () => {
    const r = makeFakeRenderer();
    const { context } = makeCtx(r);
    const scene = new GameScene(context, Math.random, 5000);
    await scene.enter({ map: tinyMap() });
    scene.pauseGame();
    assertFalse(scene.isPaused());
  });

  test("힌트 버튼 press + release 시에만 힌트 재생", async () => {
    const r = makeFakeRenderer();
    const { context, audioCalls } = makeCtx(r);
    const scene = new GameScene(context, Math.random, 0);
    await scene.enter({ map: tinyMap() });
    scene.render();
    const btn = (scene as unknown as {
      uiLayout: { hintButton: { x: number; y: number; width: number; height: number } };
    }).uiLayout.hintButton;
    const cx = btn.x + btn.width / 2;
    const cy = btn.y + btn.height / 2;
    scene.onPointerDown!(cx, cy);
    assertFalse(audioCalls.includes("hint"));
    scene.onPointerUp!(cx, cy);
    assertTrue(audioCalls.includes("hint"));
  });

  test("힌트 버튼 press 후 밖에서 release → 힌트 미발사", async () => {
    const r = makeFakeRenderer();
    const { context, audioCalls } = makeCtx(r);
    const scene = new GameScene(context, Math.random, 0);
    await scene.enter({ map: tinyMap() });
    scene.render();
    const btn = (scene as unknown as {
      uiLayout: { hintButton: { x: number; y: number; width: number; height: number } };
    }).uiLayout.hintButton;
    scene.onPointerDown!(btn.x + 1, btn.y + 1);
    scene.onPointerUp!(-10, -10);
    assertFalse(audioCalls.includes("hint"));
  });

  test("쌍 제거 후 중력 + 리필: 빈 자리가 새 블럭으로 채워져 보드 가득 유지", async () => {
    const r = makeFakeRenderer();
    const { context } = makeCtx(r);
    // RNG=0 → 리필은 1로 채움 (1 + floor(0*9) = 1).
    const scene = new GameScene(context, () => 0, 0);
    const map: MapData = {
      id: 1,
      name: "gravity-test",
      cols: 2,
      rows: 3,
      timeLimit: 60,
      hintCount: 0,
      targetScore: 0,
      starThresholds: [100, 500, 1000],
      initialBoard: [
        [1, 9],
        [2, 8],
        [3, 7],
      ],
    };
    await scene.enter({ map });
    scene.render();
    const layout = (scene as unknown as { boardRenderer: { getLayout(): any } }).boardRenderer.getLayout();
    const a = { x: layout.originX + layout.cellSize / 2, y: layout.originY + layout.cellSize / 2 };
    const b = { x: layout.originX + layout.cellSize + layout.cellSize / 2, y: layout.originY + layout.cellSize / 2 };
    scene.onPointerDown!(a.x, a.y);
    scene.onPointerMove!(b.x, b.y);
    scene.onPointerUp!(b.x, b.y);
    // 원본 row1/row2 는 유지, 맨 위는 리필(1)로 채워짐
    const board = (scene as unknown as { board: { snapshot(): number[][] } }).board;
    const snap = board.snapshot();
    assertEqual(snap[0][0], 1);
    assertEqual(snap[0][1], 1);
    assertEqual(snap[1][0], 2);
    assertEqual(snap[1][1], 8);
    assertEqual(snap[2][0], 3);
    assertEqual(snap[2][1], 7);
  });

  test("리필 후에도 유효 조합 소진 시 stuck reason으로 종료", async () => {
    const r = makeFakeRenderer();
    const { context, transitions } = makeCtx(r);
    // RNG=0 → 리필 값이 모두 1. 2x2 보드에서 모두 1이면 합=10 조합 없음.
    const scene = new GameScene(context, () => 0, 0);
    await scene.enter({
      map: {
        id: 1,
        name: "stuck",
        cols: 2,
        rows: 2,
        timeLimit: 60,
        hintCount: 0,
        targetScore: 0,
        // ★1 임계값을 한 번의 쌍 제거 점수(100)보다 높게 → stuck 시 cleared=false 예측 가능.
        starThresholds: [200, 500, 1000],
        initialBoard: [
          [3, 7],
          [1, 1],
        ],
      },
    });
    scene.render();
    const layout = (scene as unknown as { boardRenderer: { getLayout(): any } }).boardRenderer.getLayout();
    const a = { x: layout.originX + layout.cellSize / 2, y: layout.originY + layout.cellSize / 2 };
    const b = { x: layout.originX + layout.cellSize + layout.cellSize / 2, y: layout.originY + layout.cellSize / 2 };
    scene.onPointerDown!(a.x, a.y);
    scene.onPointerMove!(b.x, b.y);
    scene.onPointerUp!(b.x, b.y);
    assertTrue(scene._isEnded());
    const res = transitions[transitions.length - 1].args as GameResult;
    assertEqual(res.reason, "stuck");
    assertFalse(res.cleared);
  });

  test("일시정지 시 세션 저장 (mapId/score/timeLeft/hintsLeft/boardState)", async () => {
    const r = makeFakeRenderer();
    const { context, saveManager } = makeCtx(r);
    const scene = new GameScene(context, () => 0.5, 0);
    await scene.enter({ map: tinyMap() });
    scene.render();
    scene.pauseGame();
    // 마이크로태스크 완료 대기
    await Promise.resolve();
    const rec = await saveManager.loadSession(99);
    assertTrue(rec !== null, "세션 저장됨");
    if (rec) {
      assertEqual(rec.mapId, 99);
      assertEqual(rec.score, 0);
      assertEqual(rec.hintsLeft, 1); // tinyMap.hintCount
      assertTrue(rec.timeLeft > 0);
      assertEqual(rec.boardState.length, 1);
      assertEqual(rec.boardState[0].length, 2);
    }
  });

  test("resumeFrom: 보드/점수/남은시간/힌트 복원 + 즉시 일시정지", async () => {
    const r = makeFakeRenderer();
    const { context } = makeCtx(r);
    const scene = new GameScene(context, Math.random, 2500);
    const resumeFrom: ProgressRecord = {
      mapId: 99,
      boardState: [[7, 3]],
      score: 350,
      stars: 1,
      timeLeft: 12, // 초
      hintsLeft: 0,
      timestamp: 1_700_000_002_000,
    };
    await scene.enter({ map: tinyMap(), resumeFrom });
    // 인트로는 스킵, 일시정지로 시작
    assertFalse(scene._isInIntro());
    assertTrue(scene.isPaused());
    assertEqual(scene._getScore(), 350);
    // 보드 복원
    const snap = (scene as unknown as { board: { snapshot(): number[][] } }).board.snapshot();
    assertEqual(snap[0][0], 7);
    assertEqual(snap[0][1], 3);
    // 타이머 남은 ms ≈ 12000 (한도 5초보다 큰 값을 넣어도 setElapsedMs는 클램프하지 않지만,
    // 여기서는 timeLimit=5초 → 12초 복원은 한도 초과 → 만료 처리되므로 timeLimit=60 짜리 맵으로 다시 검증)
  });

  test("resumeFrom: 시간/힌트 복원 정확성 (timeLimit 60s, timeLeft=42)", async () => {
    const r = makeFakeRenderer();
    const { context } = makeCtx(r);
    const scene = new GameScene(context, Math.random, 0);
    const map: MapData = { ...tinyMap(), timeLimit: 60, hintCount: 3 };
    const resumeFrom: ProgressRecord = {
      mapId: 99,
      boardState: [[4, 6]],
      score: 0,
      timeLeft: 42,
      hintsLeft: 1,
      timestamp: 1_700_000_002_000,
    };
    await scene.enter({ map, resumeFrom });
    const timer = (scene as unknown as { timer: { getRemainingMs(): number; getLimitMs(): number } }).timer;
    assertEqual(timer.getLimitMs(), 60_000);
    assertEqual(timer.getRemainingMs(), 42_000);
    const hint = (scene as unknown as { hint: { getRemaining(): number } }).hint;
    assertEqual(hint.getRemaining(), 1, "복원된 힌트 잔량");
  });

  test("resumeFrom 후 '재개' 탭 → 타이머 재개, 세션 유지", async () => {
    const r = makeFakeRenderer();
    const { context, saveManager } = makeCtx(r);
    const scene = new GameScene(context, Math.random, 0);
    const map: MapData = { ...tinyMap(), timeLimit: 60 };
    const resumeFrom: ProgressRecord = {
      mapId: 99,
      boardState: [[4, 6]],
      score: 100,
      timeLeft: 30,
      hintsLeft: 0,
      timestamp: 1_700_000_003_000,
    };
    await scene.enter({ map, resumeFrom });
    scene.render();
    assertTrue(scene.isPaused());
    const menu = (scene as unknown as {
      pauseMenuLayout: { resume: { x: number; y: number; width: number; height: number } };
    }).pauseMenuLayout;
    const cx = menu.resume.x + menu.resume.width / 2;
    const cy = menu.resume.y + menu.resume.height / 2;
    scene.onPointerDown!(cx, cy);
    scene.onPointerUp!(cx, cy);
    assertFalse(scene.isPaused());
    const timer = (scene as unknown as { timer: { isRunning(): boolean } }).timer;
    assertTrue(timer.isRunning(), "재개 시 타이머 실행 중");
    // 세션은 유지 (다음 일시정지/재진입을 위해)
    await Promise.resolve();
    assertTrue((await saveManager.loadSession(99)) !== null);
  });

  test("게임 종료(timeup) 시 세션 삭제", async () => {
    const r = makeFakeRenderer();
    const { context, saveManager } = makeCtx(r);
    const scene = new GameScene(context, Math.random, 0);
    await scene.enter({ map: { ...tinyMap(), timeLimit: 1 } });
    scene.render();
    scene.pauseGame();
    await Promise.resolve();
    assertTrue((await saveManager.loadSession(99)) !== null);
    scene.resumeGame();
    scene.update(2000); // 만료
    assertTrue(scene._isEnded());
    await Promise.resolve();
    await Promise.resolve();
    assertEqual(await saveManager.loadSession(99), null, "종료 시 세션 삭제");
  });

  test("일시정지 메뉴 '다시하기' → 세션 삭제 + 점수 리셋", async () => {
    const r = makeFakeRenderer();
    const { context, saveManager } = makeCtx(r);
    const scene = new GameScene(context, () => 0.5, 0);
    await scene.enter({
      map: {
        ...tinyMap(),
        cols: 2,
        rows: 2,
        initialBoard: [
          [4, 6],
          [5, 5],
        ],
      },
    });
    scene.render();
    // 한 번 매치하여 점수 획득
    const b = (scene as unknown as { boardRenderer: { getLayout(): any } }).boardRenderer.getLayout();
    scene.onPointerDown!(b.originX + b.cellSize / 2, b.originY + b.cellSize / 2);
    scene.onPointerMove!(b.originX + b.cellSize + b.cellSize / 2, b.originY + b.cellSize / 2);
    scene.onPointerUp!(b.originX + b.cellSize + b.cellSize / 2, b.originY + b.cellSize / 2);
    assertTrue(scene._getScore() >= 100);
    scene.pauseGame();
    await Promise.resolve();
    assertTrue((await saveManager.loadSession(99)) !== null);
    // 다시하기 버튼 탭
    const menu = (scene as unknown as {
      pauseMenuLayout: { restart: { x: number; y: number; width: number; height: number } };
    }).pauseMenuLayout;
    const rx = menu.restart.x + menu.restart.width / 2;
    const ry = menu.restart.y + menu.restart.height / 2;
    scene.onPointerDown!(rx, ry);
    scene.onPointerUp!(rx, ry);
    await Promise.resolve();
    assertEqual(scene._getScore(), 0);
    assertEqual(await saveManager.loadSession(99), null, "다시하기로 세션 폐기");
  });

  test("일시정지 메뉴 '메인' → 세션 삭제 + title 전환", async () => {
    const r = makeFakeRenderer();
    const { context, saveManager, transitions } = makeCtx(r);
    const scene = new GameScene(context, Math.random, 0);
    await scene.enter({ map: tinyMap() });
    scene.render();
    scene.pauseGame();
    await Promise.resolve();
    assertTrue((await saveManager.loadSession(99)) !== null);
    const menu = (scene as unknown as {
      pauseMenuLayout: { exit: { x: number; y: number; width: number; height: number } };
    }).pauseMenuLayout;
    const ex = menu.exit.x + menu.exit.width / 2;
    const ey = menu.exit.y + menu.exit.height / 2;
    scene.onPointerDown!(ex, ey);
    scene.onPointerUp!(ex, ey);
    assertEqual(transitions[transitions.length - 1].next, "title");
    await Promise.resolve();
    assertEqual(await saveManager.loadSession(99), null, "메인으로 세션 폐기");
  });

  test("무효 선택 시 invalid 사운드", async () => {
    const r = makeFakeRenderer();
    const { context, audioCalls } = makeCtx(r);
    const scene = new GameScene(context, Math.random, 0);
    await scene.enter({
      map: {
        ...tinyMap(),
        initialBoard: [[1, 2]], // 합 3, 무효
      },
    });
    scene.render();
    const layout = (scene as unknown as { boardRenderer: { getLayout(): any } }).boardRenderer.getLayout();
    const cx1 = layout.originX + layout.cellSize / 2;
    const cx2 = layout.originX + layout.cellSize + layout.cellSize / 2;
    const cy = layout.originY + layout.cellSize / 2;
    scene.onPointerDown!(cx1, cy);
    scene.onPointerMove!(cx2, cy);
    scene.onPointerUp!(cx2, cy);
    assertTrue(audioCalls.includes("invalid"));
    assertFalse(scene._isEnded());
  });
});
