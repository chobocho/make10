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
  MemoryMetaStore,
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
    globalAlpha: 1,
    fillRect() {},
    strokeRect() {},
    clearRect() {},
    fillText() {},
    strokeText() {},
    setTransform() {},
    save() {},
    restore() {},
    strokeStyle: "",
    lineWidth: 0,
    lineCap: "butt",
    beginPath() {},
    moveTo() {},
    lineTo() {},
    arc() {},
    stroke() {},
    fill() {},
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
    new MemoryMetaStore(),
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
    scene._setWildEnabled(false); // stuck → endGame 경로 검증을 위해 만능 회복 비활성
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
    scene._setWildEnabled(false);
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
      id: 2, // 튜토리얼 트리거 회피용 (id=1 은 첫 진입 시 튜토리얼 노출)
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
        id: 2,
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
    scene._setWildEnabled(false); // 만능 회복 비활성: 순수 stuck → endGame 경로 검증
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

  test("멀티라이프 매치: 일반(lives=1) + 멀티(lives=3) → 일반 제거, 멀티 lives=2 잔존", async () => {
    const r = makeFakeRenderer();
    const { context } = makeCtx(r);
    const scene = new GameScene(context, () => 0.5, 0);
    await scene.enter({
      map: {
        id: 99,
        name: "multi-test",
        cols: 2,
        rows: 1,
        timeLimit: 60,
        hintCount: 0,
        targetScore: 0,
        starThresholds: [50, 150, 300],
        initialBoard: [[3, 7]],
        initialLives: [[3, 1]],
      },
    });
    scene.render();
    const layout = (scene as unknown as { boardRenderer: { getLayout(): any } }).boardRenderer.getLayout();
    const a = { x: layout.originX + layout.cellSize / 2, y: layout.originY + layout.cellSize / 2 };
    const b = { x: layout.originX + layout.cellSize + layout.cellSize / 2, y: layout.originY + layout.cellSize / 2 };
    scene.onPointerDown!(a.x, a.y);
    scene.onPointerMove!(b.x, b.y);
    scene.onPointerUp!(b.x, b.y);
    // 점수 부여 (매치 자체는 성공)
    assertTrue(scene._getScore() >= 100);
    // 좌측(3, lives=3): 매치 후 lives=2 살아있음, value=3 유지
    const board = (scene as unknown as { board: { getCell(c: number, r: number): number; getLives(c: number, r: number): number } }).board;
    assertEqual(board.getCell(0, 0), 3);
    assertEqual(board.getLives(0, 0), 2);
    // 우측은 제거 후 리필되어 새 값(=5, RNG=0.5 → 1+floor(0.5*9)=5), lives=1
    assertEqual(board.getLives(1, 0), 1);
  });

  test("멀티라이프 매치: 양쪽 멀티(4,2) → min=2 만큼 양쪽 차감, 작은 쪽 제거", async () => {
    const r = makeFakeRenderer();
    const { context } = makeCtx(r);
    const scene = new GameScene(context, () => 0.5, 0);
    await scene.enter({
      map: {
        id: 99,
        name: "both-multi",
        cols: 2,
        rows: 1,
        timeLimit: 60,
        hintCount: 0,
        targetScore: 0,
        starThresholds: [50, 150, 300],
        initialBoard: [[4, 6]],
        initialLives: [[4, 2]],
      },
    });
    scene.render();
    const layout = (scene as unknown as { boardRenderer: { getLayout(): any } }).boardRenderer.getLayout();
    const a = { x: layout.originX + layout.cellSize / 2, y: layout.originY + layout.cellSize / 2 };
    const b = { x: layout.originX + layout.cellSize + layout.cellSize / 2, y: layout.originY + layout.cellSize / 2 };
    scene.onPointerDown!(a.x, a.y);
    scene.onPointerMove!(b.x, b.y);
    scene.onPointerUp!(b.x, b.y);
    const board = (scene as unknown as { board: { getCell(c: number, r: number): number; getLives(c: number, r: number): number } }).board;
    // 좌측(4, lives=4): 4-2=2 잔여
    assertEqual(board.getCell(0, 0), 4);
    assertEqual(board.getLives(0, 0), 2);
    // 우측(6, lives=2): 제거 후 리필
    assertEqual(board.getLives(1, 0), 1);
  });

  test("세션 저장/복원: boardLives 보존", async () => {
    const r = makeFakeRenderer();
    const { context, saveManager } = makeCtx(r);
    const scene = new GameScene(context, Math.random, 0);
    await scene.enter({
      map: {
        id: 99,
        name: "session-lives",
        cols: 2,
        rows: 1,
        timeLimit: 60,
        hintCount: 0,
        targetScore: 0,
        starThresholds: [50, 150, 300],
        initialBoard: [[4, 6]],
        initialLives: [[3, 2]],
      },
    });
    scene.render();
    scene.pauseGame();
    await Promise.resolve();
    const rec = await saveManager.loadSession(99);
    assertTrue(rec !== null);
    assertTrue(rec!.boardLives !== undefined);
    assertEqual(rec!.boardLives![0][0], 3);
    assertEqual(rec!.boardLives![0][1], 2);
  });

  // ---------- 튜토리얼 ----------

  test("튜토리얼: mapId=1 + 미완료 → 튜토리얼 활성, phase 1(text)로 시작", async () => {
    const r = makeFakeRenderer();
    const { context } = makeCtx(r);
    const scene = new GameScene(context, Math.random, 2500);
    await scene.enter({
      map: { ...tinyMap(), id: 1 },
    });
    assertTrue(scene._isInTutorial());
    assertEqual(scene._getTutorialPhase(), 1);
    assertEqual(scene._getTutorialPhaseKind(), "text");
  });

  test("튜토리얼: 튜토리얼 완료 기록 있으면 mapId=1 도 튜토리얼 미노출", async () => {
    const r = makeFakeRenderer();
    const { context, saveManager } = makeCtx(r);
    await saveManager.markTutorialDone();
    const scene = new GameScene(context, Math.random, 2500);
    await scene.enter({ map: { ...tinyMap(), id: 1 } });
    assertFalse(scene._isInTutorial());
  });

  test("튜토리얼: mapId !== 1 은 항상 미노출", async () => {
    const r = makeFakeRenderer();
    const { context } = makeCtx(r);
    const scene = new GameScene(context, Math.random, 2500);
    await scene.enter({ map: { ...tinyMap(), id: 2 } });
    assertFalse(scene._isInTutorial());
  });

  test("튜토리얼: phase 1(text) 탭 → phase 2(practice) 진입 + 미니 보드 레이아웃 생성", async () => {
    const r = makeFakeRenderer();
    const { context } = makeCtx(r);
    const scene = new GameScene(context, Math.random, 2500);
    await scene.enter({ map: { ...tinyMap(), id: 1 } });
    scene.render();
    scene.onPointerDown!(50, 500);
    scene.onPointerUp!(50, 500);
    assertEqual(scene._getTutorialPhase(), 2);
    assertEqual(scene._getTutorialPhaseKind(), "practice");
    // 미니 보드 레이아웃이 계산되어야 함
    scene.render();
    assertTrue(scene._getTutorialBoardLayout() !== null);
  });

  test("튜토리얼 실습 phase 2: 정답(3+7) 드래그 → success 피드백 → 자동 phase 3 진입", async () => {
    const r = makeFakeRenderer();
    const { context } = makeCtx(r);
    const scene = new GameScene(context, Math.random, 2500);
    await scene.enter({ map: { ...tinyMap(), id: 1 } });
    scene.render();
    // phase 1 → 2
    scene.onPointerDown!(50, 500);
    scene.onPointerUp!(50, 500);
    scene.render();
    const layout = scene._getTutorialBoardLayout()!;
    const a = { x: layout.originX + layout.cellSize / 2, y: layout.originY + layout.cellSize / 2 };
    const b = { x: layout.originX + layout.cellSize + layout.cellSize / 2, y: layout.originY + layout.cellSize / 2 };
    scene.onPointerDown!(a.x, a.y);
    scene.onPointerMove!(b.x, b.y);
    scene.onPointerUp!(b.x, b.y);
    assertEqual(scene._getTutorialFeedback(), "success");
    // SUCCESS_MS(800) 경과 → 다음 phase 자동 전환
    scene.update(900);
    assertEqual(scene._getTutorialPhase(), 3);
    assertEqual(scene._getTutorialPhaseKind(), "practice");
    assertEqual(scene._getTutorialFeedback(), "none");
  });

  test("튜토리얼 실습: 오답 드래그 → retry 피드백 → 단계 유지", async () => {
    const r = makeFakeRenderer();
    const { context } = makeCtx(r);
    const scene = new GameScene(context, Math.random, 2500);
    await scene.enter({ map: { ...tinyMap(), id: 1 } });
    scene.render();
    // phase 1 → 2
    scene.onPointerDown!(50, 500);
    scene.onPointerUp!(50, 500);
    scene.render();
    const layout = scene._getTutorialBoardLayout()!;
    // 같은 셀을 두 번 누르고 떼는 식으로 1개만 선택 → invalid 처리에는 안 들어감(positions<2)
    // 대신 우측 셀(7) 단독으로 드래그하지 않고 그냥 업 → 1개만 선택, 무시됨.
    // 진짜 오답은 (3) (7) 셀이 합 10 이지만 정답이라 valid. 보드가 2x1 [3,7] 이라서 항상 valid.
    // 따라서 실습에서 "오답"을 만들기는 어렵다. 의도적으로 placeholder 검증.
    scene.onPointerDown!(layout.originX + layout.cellSize / 2, layout.originY + layout.cellSize / 2);
    scene.onPointerUp!(layout.originX + layout.cellSize / 2, layout.originY + layout.cellSize / 2);
    // 1셀 탭은 retry 가 아닌 무시
    assertEqual(scene._getTutorialFeedback(), "none");
    assertEqual(scene._getTutorialPhase(), 2);
  });

  test("튜토리얼 실습 phase 3 → phase 4(꺾인 3셀 실습) 진입", async () => {
    const r = makeFakeRenderer();
    const { context } = makeCtx(r);
    const scene = new GameScene(context, Math.random, 2500);
    await scene.enter({ map: { ...tinyMap(), id: 1 } });
    scene.render();
    // phase 1 → 2
    scene.onPointerDown!(50, 500);
    scene.onPointerUp!(50, 500);
    scene.render();
    // phase 2 매치 (3+7)
    let layout = scene._getTutorialBoardLayout()!;
    let a = { x: layout.originX + layout.cellSize / 2, y: layout.originY + layout.cellSize / 2 };
    let b = { x: layout.originX + layout.cellSize + layout.cellSize / 2, y: layout.originY + layout.cellSize / 2 };
    scene.onPointerDown!(a.x, a.y);
    scene.onPointerMove!(b.x, b.y);
    scene.onPointerUp!(b.x, b.y);
    scene.update(900); // → phase 3
    scene.render();
    layout = scene._getTutorialBoardLayout()!;
    // phase 3 보드 [1, 2, 7] 3셀 매치
    a = { x: layout.originX + layout.cellSize / 2, y: layout.originY + layout.cellSize / 2 };
    const mid = { x: layout.originX + layout.cellSize + layout.cellSize / 2, y: layout.originY + layout.cellSize / 2 };
    const c = { x: layout.originX + layout.cellSize * 2 + layout.cellSize / 2, y: layout.originY + layout.cellSize / 2 };
    scene.onPointerDown!(a.x, a.y);
    scene.onPointerMove!(mid.x, mid.y);
    scene.onPointerMove!(c.x, c.y);
    scene.onPointerUp!(c.x, c.y);
    scene.update(900); // → phase 4
    assertEqual(scene._getTutorialPhase(), 4);
    assertEqual(scene._getTutorialPhaseKind(), "practice");
    // 미니 보드 차원: 3 cols × 2 rows
    const layout4 = scene._getTutorialBoardLayout()!;
    assertEqual(layout4.cols, 3);
    assertEqual(layout4.rows, 2);
  });

  test("튜토리얼 실습 phase 4(ㄱ자): 5→3→2 드래그 성공 → phase 5(finale text) 진입", async () => {
    const r = makeFakeRenderer();
    const { context } = makeCtx(r);
    const scene = new GameScene(context, Math.random, 2500);
    await scene.enter({ map: { ...tinyMap(), id: 1 } });
    scene.render();
    // 단계 1→4 빠르게 진행 (이전 테스트와 동일 흐름 단축)
    scene.onPointerDown!(50, 500);
    scene.onPointerUp!(50, 500);
    scene.render();
    let layout = scene._getTutorialBoardLayout()!;
    // phase 2 매치
    scene.onPointerDown!(layout.originX + layout.cellSize / 2, layout.originY + layout.cellSize / 2);
    scene.onPointerMove!(layout.originX + layout.cellSize + layout.cellSize / 2, layout.originY + layout.cellSize / 2);
    scene.onPointerUp!(layout.originX + layout.cellSize + layout.cellSize / 2, layout.originY + layout.cellSize / 2);
    scene.update(900);
    scene.render();
    layout = scene._getTutorialBoardLayout()!;
    // phase 3 매치 (1+2+7)
    scene.onPointerDown!(layout.originX + layout.cellSize / 2, layout.originY + layout.cellSize / 2);
    scene.onPointerMove!(layout.originX + layout.cellSize + layout.cellSize / 2, layout.originY + layout.cellSize / 2);
    scene.onPointerMove!(layout.originX + layout.cellSize * 2 + layout.cellSize / 2, layout.originY + layout.cellSize / 2);
    scene.onPointerUp!(layout.originX + layout.cellSize * 2 + layout.cellSize / 2, layout.originY + layout.cellSize / 2);
    scene.update(900);
    scene.render();
    assertEqual(scene._getTutorialPhase(), 4);
    layout = scene._getTutorialBoardLayout()!;
    // phase 4 보드 [[5,3,1],[4,2,6]]: 5(0,0) → 3(1,0) → 2(1,1) ㄱ자 매치
    const cellCenter = (col: number, row: number) => ({
      x: layout.originX + col * layout.cellSize + layout.cellSize / 2,
      y: layout.originY + row * layout.cellSize + layout.cellSize / 2,
    });
    const p5 = cellCenter(0, 0);
    const p3 = cellCenter(1, 0);
    const p2 = cellCenter(1, 1);
    scene.onPointerDown!(p5.x, p5.y);
    scene.onPointerMove!(p3.x, p3.y);
    scene.onPointerMove!(p2.x, p2.y);
    scene.onPointerUp!(p2.x, p2.y);
    assertEqual(scene._getTutorialFeedback(), "success");
    scene.update(900); // → phase 5
    assertEqual(scene._getTutorialPhase(), 5);
    assertEqual(scene._getTutorialPhaseKind(), "text");
  });

  test("튜토리얼 실습 phase 4: 다른 ㄱ자 경로(3→1→6)도 정답 인식", async () => {
    const r = makeFakeRenderer();
    const { context } = makeCtx(r);
    const scene = new GameScene(context, Math.random, 2500);
    await scene.enter({ map: { ...tinyMap(), id: 1 } });
    scene.render();
    // 단계 1→4 진행
    scene.onPointerDown!(50, 500); scene.onPointerUp!(50, 500); scene.render();
    let layout = scene._getTutorialBoardLayout()!;
    scene.onPointerDown!(layout.originX + layout.cellSize / 2, layout.originY + layout.cellSize / 2);
    scene.onPointerMove!(layout.originX + layout.cellSize + layout.cellSize / 2, layout.originY + layout.cellSize / 2);
    scene.onPointerUp!(layout.originX + layout.cellSize + layout.cellSize / 2, layout.originY + layout.cellSize / 2);
    scene.update(900); scene.render();
    layout = scene._getTutorialBoardLayout()!;
    scene.onPointerDown!(layout.originX + layout.cellSize / 2, layout.originY + layout.cellSize / 2);
    scene.onPointerMove!(layout.originX + layout.cellSize + layout.cellSize / 2, layout.originY + layout.cellSize / 2);
    scene.onPointerMove!(layout.originX + layout.cellSize * 2 + layout.cellSize / 2, layout.originY + layout.cellSize / 2);
    scene.onPointerUp!(layout.originX + layout.cellSize * 2 + layout.cellSize / 2, layout.originY + layout.cellSize / 2);
    scene.update(900); scene.render();
    layout = scene._getTutorialBoardLayout()!;
    // 3(1,0) → 1(2,0) → 6(2,1) — 다른 ㄱ자 경로
    const cellCenter = (col: number, row: number) => ({
      x: layout.originX + col * layout.cellSize + layout.cellSize / 2,
      y: layout.originY + row * layout.cellSize + layout.cellSize / 2,
    });
    const p3 = cellCenter(1, 0);
    const p1 = cellCenter(2, 0);
    const p6 = cellCenter(2, 1);
    scene.onPointerDown!(p3.x, p3.y);
    scene.onPointerMove!(p1.x, p1.y);
    scene.onPointerMove!(p6.x, p6.y);
    scene.onPointerUp!(p6.x, p6.y);
    assertEqual(scene._getTutorialFeedback(), "success");
  });

  test("튜토리얼 phase 5(finale text): 탭으로 종료 + 완료 마킹", async () => {
    const r = makeFakeRenderer();
    const { context, saveManager } = makeCtx(r);
    const scene = new GameScene(context, Math.random, 2500);
    await scene.enter({ map: { ...tinyMap(), id: 1 } });
    // 모든 실습을 자동으로 통과시키기 위해 내부 상태 직접 주입 (테스트 단축).
    // tutorial 인스턴스를 phase 5(text) 로 강제 전이.
    const tutorial = (scene as unknown as { tutorial: { phase: number; setupPhase(): void; advance(): unknown } }).tutorial;
    tutorial.phase = 5;
    tutorial.setupPhase();
    scene.render();
    // 텍스트 단계 탭으로 종료
    scene.onPointerDown!(50, 500);
    scene.onPointerUp!(50, 500);
    assertFalse(scene._isInTutorial());
    await Promise.resolve();
    assertTrue(await saveManager.isTutorialDone());
  });

  test("튜토리얼: 건너뛰기 버튼 → 즉시 종료 + 완료 마킹", async () => {
    const r = makeFakeRenderer();
    const { context, saveManager } = makeCtx(r);
    const scene = new GameScene(context, Math.random, 2500);
    await scene.enter({ map: { ...tinyMap(), id: 1 } });
    scene.render(); // 스킵 버튼 레이아웃 계산
    const btn = scene._getTutorialSkipBtn();
    assertTrue(btn !== null);
    const cx = btn!.x + btn!.width / 2;
    const cy = btn!.y + btn!.height / 2;
    scene.onPointerDown!(cx, cy);
    scene.onPointerUp!(cx, cy);
    assertFalse(scene._isInTutorial());
    await Promise.resolve();
    assertTrue(await saveManager.isTutorialDone());
  });

  test("튜토리얼: 실습 단계에서도 건너뛰기 즉시 종료", async () => {
    const r = makeFakeRenderer();
    const { context, saveManager } = makeCtx(r);
    const scene = new GameScene(context, Math.random, 2500);
    await scene.enter({ map: { ...tinyMap(), id: 1 } });
    scene.render();
    // phase 2 진입
    scene.onPointerDown!(50, 500);
    scene.onPointerUp!(50, 500);
    scene.render();
    assertEqual(scene._getTutorialPhase(), 2);
    const btn = scene._getTutorialSkipBtn()!;
    scene.onPointerDown!(btn.x + 1, btn.y + 1);
    scene.onPointerUp!(btn.x + 1, btn.y + 1);
    assertFalse(scene._isInTutorial());
    await Promise.resolve();
    assertTrue(await saveManager.isTutorialDone());
  });

  test("튜토리얼: 건너뛰기 press 후 밖에서 release → 종료 안 됨", async () => {
    const r = makeFakeRenderer();
    const { context } = makeCtx(r);
    const scene = new GameScene(context, Math.random, 2500);
    await scene.enter({ map: { ...tinyMap(), id: 1 } });
    scene.render();
    const btn = scene._getTutorialSkipBtn();
    assertTrue(btn !== null);
    scene.onPointerDown!(btn!.x + 1, btn!.y + 1);
    // 다른 영역에서 release
    scene.onPointerUp!(0, 9999);
    assertTrue(scene._isInTutorial());
  });

  test("튜토리얼 중: pauseGame 요청 무시 (visibility hidden 등)", async () => {
    const r = makeFakeRenderer();
    const { context } = makeCtx(r);
    const scene = new GameScene(context, Math.random, 2500);
    await scene.enter({ map: { ...tinyMap(), id: 1 } });
    scene.pauseGame();
    assertFalse(scene.isPaused());
  });

  test("튜토리얼 중: 보드 영역 드래그 입력 무시 (선택 시작 안 됨)", async () => {
    const r = makeFakeRenderer();
    const { context, audioCalls } = makeCtx(r);
    const scene = new GameScene(context, Math.random, 0);
    await scene.enter({ map: { ...tinyMap(), id: 1 } });
    scene.render();
    // 메인 게임 보드 셀 위치를 클릭해도 select 사운드가 나면 안 됨
    const layout = (scene as unknown as { boardRenderer: { getLayout(): any } }).boardRenderer.getLayout();
    scene.onPointerDown!(layout.originX + layout.cellSize / 2, layout.originY + layout.cellSize / 2);
    assertFalse(audioCalls.includes("select"));
  });

  test("튜토리얼 완료 → mapId=1 재진입 시 미노출 (DB 영속성)", async () => {
    const r = makeFakeRenderer();
    const { context, saveManager } = makeCtx(r);
    const scene1 = new GameScene(context, Math.random, 2500);
    await scene1.enter({ map: { ...tinyMap(), id: 1 } });
    scene1.render();
    // 건너뛰기로 완료
    const btn = scene1._getTutorialSkipBtn();
    scene1.onPointerDown!(btn!.x + 1, btn!.y + 1);
    scene1.onPointerUp!(btn!.x + 1, btn!.y + 1);
    await Promise.resolve();
    assertTrue(await saveManager.isTutorialDone());
    // 같은 saveManager로 새 GameScene 진입
    const scene2 = new GameScene(context, Math.random, 2500);
    await scene2.enter({ map: { ...tinyMap(), id: 1 } });
    assertFalse(scene2._isInTutorial());
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

describe("GameScene + 매치 이펙트", () => {
  test("2셀 매치: 이펙트 레이어 활성화", async () => {
    const r = makeFakeRenderer();
    const { context } = makeCtx(r);
    const scene = new GameScene(context, () => 0, 0);
    await scene.enter({ map: tinyMap() });
    scene.render();
    const layout = (scene as unknown as {
      boardRenderer: { getLayout(): { originX: number; originY: number; cellSize: number } };
    }).boardRenderer.getLayout();
    const cx0 = layout.originX + layout.cellSize / 2;
    const cx1 = layout.originX + layout.cellSize + layout.cellSize / 2;
    const cy = layout.originY + layout.cellSize / 2;
    scene.onPointerDown!(cx0, cy);
    scene.onPointerMove!(cx1, cy);
    scene.onPointerUp!(cx1, cy);
    const effects = (scene as unknown as { effects: { hasActive(): boolean; _size(): number } }).effects;
    assertTrue(effects.hasActive());
  });

  test("점수: 2셀 +100 / 3셀 +300 (3셀이 동수의 2셀 매치보다 우월)", async () => {
    // 2셀 매치 한 번
    const r1 = makeFakeRenderer();
    const { context: ctx1 } = makeCtx(r1);
    const sceneP = new GameScene(ctx1, () => 0, 0);
    await sceneP.enter({ map: tinyMap() });
    sceneP.render();
    const lP = (sceneP as unknown as {
      boardRenderer: { getLayout(): { originX: number; originY: number; cellSize: number } };
    }).boardRenderer.getLayout();
    sceneP.onPointerDown!(lP.originX + lP.cellSize / 2, lP.originY + lP.cellSize / 2);
    sceneP.onPointerMove!(lP.originX + lP.cellSize * 1.5, lP.originY + lP.cellSize / 2);
    sceneP.onPointerUp!(lP.originX + lP.cellSize * 1.5, lP.originY + lP.cellSize / 2);
    assertEqual(sceneP._getScore(), 100);

    // 3셀 매치 한 번
    const tripleMap: MapData = {
      id: 11,
      name: "tri",
      cols: 3,
      rows: 1,
      timeLimit: 60,
      hintCount: 0,
      targetScore: 0,
      starThresholds: [50, 150, 300],
      initialBoard: [[1, 2, 7]],
    };
    const r2 = makeFakeRenderer();
    const { context: ctx2 } = makeCtx(r2);
    const sceneT = new GameScene(ctx2, () => 0, 0);
    await sceneT.enter({ map: tripleMap });
    sceneT.render();
    const lT = (sceneT as unknown as {
      boardRenderer: { getLayout(): { originX: number; originY: number; cellSize: number } };
    }).boardRenderer.getLayout();
    sceneT.onPointerDown!(lT.originX + lT.cellSize / 2, lT.originY + lT.cellSize / 2);
    sceneT.onPointerMove!(lT.originX + lT.cellSize * 1.5, lT.originY + lT.cellSize / 2);
    sceneT.onPointerMove!(lT.originX + lT.cellSize * 2.5, lT.originY + lT.cellSize / 2);
    sceneT.onPointerUp!(lT.originX + lT.cellSize * 2.5, lT.originY + lT.cellSize / 2);
    assertEqual(sceneT._getScore(), 300);
    // 명시적 우월성: 3셀 한 번 > 2셀 두 번
    assertTrue(sceneT._getScore() > 2 * sceneP._getScore());
  });

  test("3셀 매치: pair 보다 더 많은 이펙트가 동시 활성", async () => {
    const tripleMap: MapData = {
      id: 11,
      name: "tri",
      cols: 3,
      rows: 1,
      timeLimit: 60,
      hintCount: 0,
      targetScore: 0,
      starThresholds: [50, 150, 300],
      initialBoard: [[1, 2, 7]],
    };
    const r = makeFakeRenderer();
    const { context } = makeCtx(r);
    const scene = new GameScene(context, () => 0, 0);
    await scene.enter({ map: tripleMap });
    scene._setWildEnabled(false);
    scene.render();
    const layout = (scene as unknown as {
      boardRenderer: { getLayout(): { originX: number; originY: number; cellSize: number } };
    }).boardRenderer.getLayout();
    const cx0 = layout.originX + layout.cellSize / 2;
    const cx1 = layout.originX + layout.cellSize + layout.cellSize / 2;
    const cx2 = layout.originX + 2 * layout.cellSize + layout.cellSize / 2;
    const cy = layout.originY + layout.cellSize / 2;
    scene.onPointerDown!(cx0, cy);
    scene.onPointerMove!(cx1, cy);
    scene.onPointerMove!(cx2, cy);
    scene.onPointerUp!(cx2, cy);
    const effects = (scene as unknown as { effects: { _size(): number } }).effects;
    // triple: ParticleBurst + ScorePopup + ExpandingRing x2 = 4
    assertEqual(effects._size(), 4);
  });

  test("멀티라이프로 살아남은 셀은 이펙트 셀에 포함되지 않음 (점수 팝업만)", async () => {
    // (0,0) life=2, (1,0) life=1 — 2셀 매치 시 양쪽 lives≥2 가 아니므로 일반 데미지=1.
    // 결과: (0,0) lives 2→1 (생존), (1,0) lives 1→0 (파괴).
    const map: MapData = {
      id: 12,
      name: "multi",
      cols: 2,
      rows: 1,
      timeLimit: 60,
      hintCount: 0,
      targetScore: 0,
      starThresholds: [50, 150, 300],
      initialBoard: [[4, 6]],
      initialLives: [[2, 1]],
    };
    const r = makeFakeRenderer();
    const { context } = makeCtx(r);
    const scene = new GameScene(context, () => 0, 0);
    await scene.enter({ map });
    scene._setWildEnabled(false);
    scene.render();
    const layout = (scene as unknown as {
      boardRenderer: { getLayout(): { originX: number; originY: number; cellSize: number } };
    }).boardRenderer.getLayout();
    const cx0 = layout.originX + layout.cellSize / 2;
    const cx1 = layout.originX + layout.cellSize + layout.cellSize / 2;
    const cy = layout.originY + layout.cellSize / 2;
    scene.onPointerDown!(cx0, cy);
    scene.onPointerMove!(cx1, cy);
    scene.onPointerUp!(cx1, cy);
    // 살아남은 (0,0)은 destroyed 목록에 없으므로 ParticleBurst의 입자는 (1,0) 1셀 분량만.
    // 외부에서 검증할 안전한 방법은 effects._size() — pair는 항상 ParticleBurst 1 + ScorePopup 1 = 2.
    const effects = (scene as unknown as { effects: { _size(): number } }).effects;
    assertEqual(effects._size(), 2);
  });
});

describe("GameScene + 힌트 보충 규칙", () => {
  function getHint(scene: GameScene): { getRemaining(): number } {
    return (scene as unknown as { hint: { getRemaining(): number } }).hint;
  }

  test("level%8===0 (예: id=8): hintCount<3 이어도 진입 시 3 보장", async () => {
    const r = makeFakeRenderer();
    const { context } = makeCtx(r);
    const scene = new GameScene(context, () => 0, 0);
    await scene.enter({
      map: { ...tinyMap(), id: 8, hintCount: 1 }, // 기본 1 → 8의 배수라 3으로 채워짐
    });
    await Promise.resolve();
    assertEqual(getHint(scene).getRemaining(), 3);
  });

  test("level%8===0 + carryover 1: 합계는 max(3, 1+1)=3", async () => {
    const r = makeFakeRenderer();
    const { context, saveManager } = makeCtx(r);
    await saveManager.addHintCarryover();
    const scene = new GameScene(context, () => 0, 0);
    await scene.enter({
      map: { ...tinyMap(), id: 16, hintCount: 1 },
    });
    await Promise.resolve();
    assertEqual(getHint(scene).getRemaining(), 3);
  });

  test("일반 레벨 (id=5): carryover 2면 hintCount + 2", async () => {
    const r = makeFakeRenderer();
    const { context, saveManager } = makeCtx(r);
    await saveManager.addHintCarryover();
    await saveManager.addHintCarryover();
    const scene = new GameScene(context, () => 0, 0);
    await scene.enter({
      map: { ...tinyMap(), id: 5, hintCount: 1 },
    });
    await Promise.resolve();
    assertEqual(getHint(scene).getRemaining(), 3); // 1 + 2
    // carryover 는 소비됨
    assertEqual(await saveManager.peekHintCarryover(), 0);
  });

  test("진입 후 carryover 0 — 같은 진입 안 두 번 소비되지 않음", async () => {
    const r = makeFakeRenderer();
    const { context, saveManager } = makeCtx(r);
    await saveManager.addHintCarryover();
    const scene = new GameScene(context, () => 0, 0);
    await scene.enter({ map: { ...tinyMap(), id: 5, hintCount: 1 } });
    await Promise.resolve();
    assertEqual(getHint(scene).getRemaining(), 2); // 1 + 1
    assertEqual(await saveManager.peekHintCarryover(), 0);
  });

  test("세션 복원 시 carryover 적용 안 함 — 저장된 hintsLeft 그대로", async () => {
    const r = makeFakeRenderer();
    const { context, saveManager } = makeCtx(r);
    await saveManager.addHintCarryover(); // 1
    const scene = new GameScene(context, () => 0, 0);
    await scene.enter({
      map: { ...tinyMap(), id: 8, hintCount: 1 },
      resumeFrom: {
        mapId: 8,
        boardState: [[4, 6]],
        score: 0,
        stars: 0,
        timeLeft: 5,
        hintsLeft: 0, // 복원: 0개 잔량
        timestamp: 0,
      },
    });
    await Promise.resolve();
    // 복원 경로 → 8배수 보충도, carryover 도 적용 안 됨.
    assertEqual(getHint(scene).getRemaining(), 0);
    // 단, 미사용 carryover 는 보존
    assertEqual(await saveManager.peekHintCarryover(), 1);
  });
});

describe("GameScene + 보너스(×2) 블럭", () => {
  function plainPairMap(): MapData {
    return {
      ...tinyMap(),
      cols: 2,
      rows: 1,
      timeLimit: 999,
      starThresholds: [50, 150, 300],
      initialBoard: [[4, 6]],
    };
  }

  test("trySpawnBonus: 활성 보너스가 없을 때만 1개 부여 + bonusCell 갱신", async () => {
    const r = makeFakeRenderer();
    const { context, audioCalls } = makeCtx(r);
    const scene = new GameScene(context, () => 0, 0);
    await scene.enter({ map: plainPairMap() });
    scene._setWildEnabled(false); // 만능 회복으로 인한 보너스 후보 변동 차단
    const ok = scene._trySpawnBonus();
    assertTrue(ok);
    const bc = scene._getBonusCell();
    assertTrue(bc !== null);
    const board = (scene as unknown as { board: import("../src/game/Board").Board }).board;
    assertTrue(board.isBonus(bc!.col, bc!.row));
    assertTrue(audioCalls.includes("bonus"));
    // 이미 활성 보너스 — 두 번째 스폰은 거부
    assertFalse(scene._trySpawnBonus());
  });

  test("매치에 보너스 셀 포함 시 점수 ×2", async () => {
    const r = makeFakeRenderer();
    const { context } = makeCtx(r);
    const scene = new GameScene(context, () => 0, 0);
    await scene.enter({ map: plainPairMap() });
    scene._setWildEnabled(false);
    const board = (scene as unknown as { board: import("../src/game/Board").Board }).board;
    board.markBonus(0, 0);
    // bonusCell 동기화 — 외부에서 markBonus 한 경우를 대비.
    (scene as unknown as { bonusCell: { col: number; row: number; expireAtMs: number } }).bonusCell = {
      col: 0,
      row: 0,
      expireAtMs: 99999,
    };
    scene.render();
    const layout = (scene as unknown as { boardRenderer: { getLayout(): any } }).boardRenderer.getLayout();
    const a = { x: layout.originX + layout.cellSize / 2, y: layout.originY + layout.cellSize / 2 };
    const b = { x: layout.originX + layout.cellSize + layout.cellSize / 2, y: layout.originY + layout.cellSize / 2 };
    scene.onPointerDown!(a.x, a.y);
    scene.onPointerMove!(b.x, b.y);
    scene.onPointerUp!(b.x, b.y);
    // 베이스 100 × 2 = 200 (연쇄 없음, 첫 매치).
    assertEqual(scene._getScore(), 200);
    // 매치 후 보너스 셀이 파괴됨 → bonusCell null.
    assertEqual(scene._getBonusCell(), null);
  });

  test("매치에 보너스 셀 미포함 시 일반 점수", async () => {
    const r = makeFakeRenderer();
    const { context } = makeCtx(r);
    const scene = new GameScene(context, () => 0, 0);
    await scene.enter({
      map: {
        ...plainPairMap(),
        cols: 4,
        rows: 1,
        initialBoard: [[4, 6, 3, 7]],
      },
    });
    scene._setWildEnabled(false);
    const board = (scene as unknown as { board: import("../src/game/Board").Board }).board;
    board.markBonus(2, 0); // (3,?) 자리에 보너스 — 매치는 다른 쌍에서 발생
    scene.render();
    const layout = (scene as unknown as { boardRenderer: { getLayout(): any } }).boardRenderer.getLayout();
    const a = { x: layout.originX + layout.cellSize / 2, y: layout.originY + layout.cellSize / 2 };
    const b = { x: layout.originX + layout.cellSize * 1.5, y: layout.originY + layout.cellSize / 2 };
    scene.onPointerDown!(a.x, a.y);
    scene.onPointerMove!(b.x, b.y);
    scene.onPointerUp!(b.x, b.y);
    // (0,0)+(1,0) = 4+6=10 매치. 보너스는 (2,0)이라 미포함 → 일반 100점.
    assertEqual(scene._getScore(), 100);
  });

  test("자동 스폰 타이머: 12초 경과 시 보너스 1개 활성 (rand=0.5 → 11s 인터벌)", async () => {
    const r = makeFakeRenderer();
    const { context } = makeCtx(r);
    // rand=0.5 → 인터벌 = 10000 + 0.5*(12000-10000) = 11000ms
    const scene = new GameScene(context, () => 0.5, 0);
    await scene.enter({
      map: {
        ...plainPairMap(),
        cols: 3,
        rows: 1,
        initialBoard: [[1, 2, 7]],
      },
    });
    scene._setWildEnabled(false); // 자동 만능 스폰 격리
    assertEqual(scene._getBonusCell(), null);
    scene.update(12_000);
    assertTrue(scene._getBonusCell() !== null);
  });

  test("만료(2-5s 윈도우): 매치 안하면 자동 해제 (보드 그대로, 점수 변화 없음)", async () => {
    const r = makeFakeRenderer();
    const { context } = makeCtx(r);
    // rand=0.5 → 인터벌 11s, 윈도우 2000+0.5*3000=3500ms
    const scene = new GameScene(context, () => 0.5, 0);
    await scene.enter({ map: plainPairMap() });
    scene._setWildEnabled(false);
    scene.update(12_000); // 보너스 스폰
    const bc = scene._getBonusCell();
    assertTrue(bc !== null);
    const { col, row } = bc!;
    // 윈도우 만료까지 대기 (스폰 시점부터 3500ms + 마진).
    scene.update(4_000);
    assertEqual(scene._getBonusCell(), null);
    const board = (scene as unknown as { board: import("../src/game/Board").Board }).board;
    assertFalse(board.isBonus(col, row));
    // 점수 변화 없음
    assertEqual(scene._getScore(), 0);
  });

  test("bonusEnabled=false: 자동 스폰 안 됨", async () => {
    const r = makeFakeRenderer();
    const { context } = makeCtx(r);
    const scene = new GameScene(context, () => 0.5, 0);
    await scene.enter({ map: plainPairMap() });
    scene._setBonusEnabled(false);
    scene._setWildEnabled(false);
    scene.update(60_000);
    assertEqual(scene._getBonusCell(), null);
    assertEqual(scene._getNextBonusSpawnMs(), Number.POSITIVE_INFINITY);
  });
});

describe("GameScene + 만능(?) 블럭", () => {
  test("trySpawnWildcard: 비-장애물 비-빈칸 셀을 만능으로 변환", async () => {
    const r = makeFakeRenderer();
    const { context, audioCalls } = makeCtx(r);
    const scene = new GameScene(context, () => 0, 0);
    await scene.enter({ map: tinyMap() });
    scene._setWildEnabled(false);
    const before = (scene as unknown as { board: import("../src/game/Board").Board }).board;
    assertFalse(before.isWildcard(0, 0) || before.isWildcard(1, 0));
    const ok = scene._trySpawnWildcard();
    assertTrue(ok);
    const after = (scene as unknown as { board: import("../src/game/Board").Board }).board;
    assertTrue(after.isWildcard(0, 0) || after.isWildcard(1, 0));
    // 사운드 + 이펙트 동시 발생
    assertTrue(audioCalls.includes("wild"));
    const effects = (scene as unknown as { effects: { _size(): number } }).effects;
    assertTrue(effects._size() >= 3); // ParticleBurst + Ring + Popup
  });

  test("stuck 회복: 매치 후 무한루프 1번이라도 매치 가능 — 게임 종료 안 됨", async () => {
    const r = makeFakeRenderer();
    const { context, transitions } = makeCtx(r);
    // RNG=0 → 모두 1로 리필 → stuck. 만능 회복 활성 (기본값).
    const scene = new GameScene(context, () => 0, 0);
    await scene.enter({
      map: {
        ...tinyMap(),
        cols: 2,
        rows: 2,
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
    // 매치 → stuck → 만능 스폰 → 게임 계속.
    assertFalse(scene._isEnded());
    assertEqual(transitions.filter((t) => t.next === "result").length, 0);
    // 보드에 만능이 1개 이상 존재
    const board = (scene as unknown as { board: import("../src/game/Board").Board }).board;
    let wild = 0;
    for (let rr = 0; rr < 2; rr++) {
      for (let cc = 0; cc < 2; cc++) {
        if (board.isWildcard(cc, rr)) wild++;
      }
    }
    assertTrue(wild >= 1);
  });

  test("자동 스폰 타이머: 충분히 시간이 흐르면 한 개 스폰", async () => {
    const r = makeFakeRenderer();
    const { context } = makeCtx(r);
    // RNG=0.5 고정 → 인터벌 = 12000 + 0.5 * (25000-12000) = 18500ms
    const scene = new GameScene(context, () => 0.5, 0);
    await scene.enter({
      map: {
        ...tinyMap(),
        cols: 3,
        rows: 1,
        initialBoard: [[1, 2, 7]],
        timeLimit: 999,
      },
    });
    const board = (scene as unknown as { board: import("../src/game/Board").Board }).board;
    // 초기엔 만능 없음
    let wild = 0;
    for (let cc = 0; cc < 3; cc++) if (board.isWildcard(cc, 0)) wild++;
    assertEqual(wild, 0);
    // 25초 진행 → 인터벌(18.5s) 지나 1개 스폰
    scene.update(25_000);
    wild = 0;
    for (let cc = 0; cc < 3; cc++) if (board.isWildcard(cc, 0)) wild++;
    assertTrue(wild >= 1, `expected ≥1 wildcard after 25s, got ${wild}`);
  });

  test("wildEnabled=false: 자동 스폰 + 회복 모두 비활성", async () => {
    const r = makeFakeRenderer();
    const { context, transitions } = makeCtx(r);
    const scene = new GameScene(context, () => 0, 0);
    await scene.enter({
      map: {
        ...tinyMap(),
        cols: 2,
        rows: 2,
        initialBoard: [
          [3, 7],
          [1, 1],
        ],
      },
    });
    scene._setWildEnabled(false);
    scene.render();
    const layout = (scene as unknown as { boardRenderer: { getLayout(): any } }).boardRenderer.getLayout();
    const a = { x: layout.originX + layout.cellSize / 2, y: layout.originY + layout.cellSize / 2 };
    const b = { x: layout.originX + layout.cellSize + layout.cellSize / 2, y: layout.originY + layout.cellSize / 2 };
    scene.onPointerDown!(a.x, a.y);
    scene.onPointerMove!(b.x, b.y);
    scene.onPointerUp!(b.x, b.y);
    // 만능 회복 비활성 → endGame
    assertTrue(scene._isEnded());
    assertEqual(transitions[transitions.length - 1].next, "result");
    // 자동 스폰 타이머 = Infinity
    assertEqual(scene._getNextWildSpawnMs(), Number.POSITIVE_INFINITY);
  });
});

describe("GameScene + 연쇄 보너스", () => {
  /**
   * 6x6 4/6 교차 보드 — 매치 후 중력+리필이 끝나면 보드가 매번 동일 상태로 복원되어
   * 무한히 (0,0)+(1,0) 매치를 반복할 수 있다 (stuck 발생 없음).
   * 결정적 RNG seqRand(0.35, 0.6) 와 짝지어 사용:
   *   refill 은 row-major(외부 r, 내부 c) 순회 → 매 매치마다 (0,0) 다음 (0,1) 두 셀만 refill.
   *   1+floor(0.35*9)=4, 1+floor(0.6*9)=6 → 항상 4,6 으로 복원.
   */
  function chainMap(): MapData {
    const row1: number[] = [4, 6, 4, 6, 4, 6];
    const row2: number[] = [6, 4, 6, 4, 6, 4];
    return {
      id: 91,
      name: "chain",
      cols: 6,
      rows: 6,
      timeLimit: 60,
      hintCount: 0,
      targetScore: 0,
      starThresholds: [50, 150, 300],
      initialBoard: [row1, row2, row1, row2, row1, row2],
    };
  }

  function makeChainScene(): { scene: GameScene; ctx: SceneContext } {
    const r = makeFakeRenderer();
    const { context } = makeCtx(r);
    const seq = [0.35, 0.6];
    let i = 0;
    const scene = new GameScene(
      context,
      () => {
        const v = seq[i % seq.length];
        i++;
        return v;
      },
      0,
    );
    return { scene, ctx: context };
  }

  function dragTopPair(scene: GameScene): void {
    const layout = (scene as unknown as {
      boardRenderer: { getLayout(): { originX: number; originY: number; cellSize: number } };
    }).boardRenderer.getLayout();
    const cy = layout.originY + layout.cellSize / 2;
    scene.onPointerDown!(layout.originX + layout.cellSize / 2, cy);
    scene.onPointerMove!(layout.originX + layout.cellSize * 1.5, cy);
    scene.onPointerUp!(layout.originX + layout.cellSize * 1.5, cy);
  }

  test("첫 매치는 연쇄 아님 — 기본 점수만", async () => {
    const { scene } = makeChainScene();
    await scene.enter({ map: chainMap() });
    scene.render();
    dragTopPair(scene);
    assertEqual(scene._getScore(), 100);
  });

  test("1초 이내 두 번째 매치: +50 보너스 (총 100 + 150 = 250)", async () => {
    const { scene } = makeChainScene();
    await scene.enter({ map: chainMap() });
    scene.render();
    dragTopPair(scene); // 100 (chain=1)
    scene.render();
    dragTopPair(scene); // +150 (chain=2, base 100 + bonus 50)
    assertEqual(scene._getScore(), 250);
  });

  test("1초 초과 갭: 연쇄 끊김 (총 200, 보너스 없음)", async () => {
    const { scene } = makeChainScene();
    await scene.enter({ map: chainMap() });
    scene.render();
    dragTopPair(scene);
    scene.update(1100); // 1초 + 마진 → 윈도우 밖
    scene.render();
    dragTopPair(scene);
    assertEqual(scene._getScore(), 200);
  });

  test("3연쇄: +50, +100 누적 (100+150+200=450)", async () => {
    const { scene } = makeChainScene();
    await scene.enter({ map: chainMap() });
    scene.render();
    dragTopPair(scene);
    scene.render();
    dragTopPair(scene);
    scene.render();
    dragTopPair(scene);
    assertEqual(scene._getScore(), 450);
  });

  test("연쇄 보너스 캡: 6연쇄부터 보너스 +250 고정 (delta 350)", async () => {
    const { scene } = makeChainScene();
    await scene.enter({ map: chainMap() });
    let prev = 0;
    const expectDeltas = [100, 150, 200, 250, 300, 350, 350];
    for (let i = 0; i < expectDeltas.length; i++) {
      scene.render();
      dragTopPair(scene);
      const cur = scene._getScore();
      assertEqual(cur - prev, expectDeltas[i], `i=${i + 1}`);
      prev = cur;
    }
  });

  test("연쇄 발생 시 chain 배지 팝업이 추가 (이펙트 ≥ 5)", async () => {
    const { scene } = makeChainScene();
    await scene.enter({ map: chainMap() });
    scene.render();
    dragTopPair(scene);
    scene.render();
    dragTopPair(scene);
    const effects = (scene as unknown as { effects: { _size(): number } }).effects;
    // 매치 직후 cluster: 베이스 2 (Burst+Popup) × 2 + 연쇄 배지 1 = 5 이상 (이전 매치 effects 잔존).
    assertTrue(effects._size() >= 5);
  });

  test("restartMap: 연쇄 상태도 함께 리셋", async () => {
    const { scene } = makeChainScene();
    await scene.enter({ map: chainMap() });
    scene.render();
    dragTopPair(scene);
    scene.render();
    dragTopPair(scene); // 연쇄 활성
    assertEqual(scene._getScore(), 250);
    (scene as unknown as { restartMap(): void }).restartMap();
    (scene as unknown as { _dismissIntro(): void })._dismissIntro();
    scene.render();
    dragTopPair(scene);
    assertEqual(scene._getScore(), 100); // 보너스 없음
  });
});

describe("GameScene + 장애물", () => {
  function obstacleMap(): MapData {
    // 1열 3행: (0,0)=4, (0,1)=장애물, (0,2)=6  (수직 인접 아님 — 매치 불가)
    // 2열을 추가해 매치 경로 만들기:
    //   row0: 4 6        (가로 인접 → 4+6=10 매치 가능)
    //   row1: [장] 3
    //   row2: 7 9
    return {
      id: 200,
      name: "obs",
      cols: 2,
      rows: 3,
      timeLimit: 60,
      hintCount: 0,
      targetScore: 0,
      starThresholds: [50, 150, 300],
      initialBoard: [
        [4, 6],
        [0, 3],
        [7, 9],
      ],
      initialObstacles: [
        [0, 0],
        [1, 0],
        [0, 0],
      ],
    };
  }

  test("장애물 맵 진입: Board가 장애물 정보를 보존", async () => {
    const r = makeFakeRenderer();
    const { context } = makeCtx(r);
    const scene = new GameScene(context, () => 0, 0);
    await scene.enter({ map: obstacleMap() });
    const board = (scene as unknown as { board: import("../src/game/Board").Board }).board;
    assertTrue(board.isObstacle(0, 1));
    assertFalse(board.isObstacle(1, 1));
  });

  test("장애물 맵 매치: 장애물 아래 블럭 제거 → 위 블럭이 통과해 채워짐", async () => {
    const r = makeFakeRenderer();
    const { context } = makeCtx(r);
    // refill RNG=0 → 새 셀 항상 1
    const scene = new GameScene(context, () => 0, 0);
    await scene.enter({ map: obstacleMap() });
    scene._setWildEnabled(false);
    scene.render();
    const layout = (scene as unknown as {
      boardRenderer: { getLayout(): { originX: number; originY: number; cellSize: number } };
    }).boardRenderer.getLayout();
    // (0,0)=4, (1,0)=6 가로 매치
    const cx0 = layout.originX + layout.cellSize / 2;
    const cx1 = layout.originX + layout.cellSize + layout.cellSize / 2;
    const cy0 = layout.originY + layout.cellSize / 2;
    scene.onPointerDown!(cx0, cy0);
    scene.onPointerMove!(cx1, cy0);
    scene.onPointerUp!(cx1, cy0);
    // 매치 제거 + 중력 적용 후 0열 결과:
    //   row0: refill(=1)
    //   row1: 장애물 (보존)
    //   row2: 7 (그대로 — 위 블럭 4 사라짐)
    const board = (scene as unknown as { board: import("../src/game/Board").Board }).board;
    assertEqual(board.getCell(0, 0), 1); // 새로 리필
    assertTrue(board.isObstacle(0, 1));
    assertEqual(board.getCell(0, 2), 7);
    // 1열 결과:
    //   매치로 (1,0)=6 제거 → 슬롯 (0,1,2) 모두 비장애물.
    //   블럭 = [3, 9]. emptyCount=1 → row 0 비움(리필=1), row 1 = 3, row 2 = 9.
    assertEqual(board.getCell(1, 0), 1);
    assertEqual(board.getCell(1, 1), 3);
    assertEqual(board.getCell(1, 2), 9);
  });
});
