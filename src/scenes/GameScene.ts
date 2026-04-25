/**
 * GameScene — 메인 게임 씬. Board/Selector/Timer/Hint + 입력/렌더링을 엮는다.
 *
 * 라이프사이클: enter(map) → update/render 루프 → endGame → transition('result').
 */
import type { Scene, SceneContext } from "./Scene";
import type { MapData } from "../data/MapLoader";
import { Board } from "../game/Board";
import { Selector } from "../game/Selector";
import { Timer } from "../game/Timer";
import { Hint, findValidCombination } from "../game/Hint";
import { computeStars, starsString } from "../game/Scoring";
import {
  BoardRenderer,
  computeBoardLayout,
  hitTestCell,
} from "../renderer/BoardRenderer";
import {
  UIRenderer,
  computeUILayout,
  isHintButtonHit,
  isPauseButtonHit,
  UILayout,
} from "../renderer/UIRenderer";
import {
  computePauseMenuLayout,
  hitButton,
  ButtonRect,
} from "./SceneLayout";
import type { ProgressRecord } from "../storage/SaveManager";

export interface GameSceneArgs {
  readonly map: MapData;
  /**
   * 진행 중 세션에서 복원할 때 전달. 보드/점수/타이머/힌트 잔량을 그대로 복원하고
   * 인트로를 건너뛴 뒤 즉시 일시정지 오버레이를 띄운다.
   */
  readonly resumeFrom?: ProgressRecord;
}

export type GameEndReason = "cleared" | "timeup" | "stuck";

export interface GameResult {
  readonly mapId: number;
  readonly mapName: string;
  /** `stars >= 1` 과 동일 — 기준점수(★1) 달성 여부. */
  readonly cleared: boolean;
  readonly score: number;
  readonly stars: number;
  readonly timeLeft: number;
  readonly reason: GameEndReason;
  readonly starThresholds: readonly [number, number, number];
}

const SCORE_PAIR = 100;
const SCORE_TRIPLE = 250;
const DEFAULT_INTRO_MS = 2500;

/** 튜토리얼 슬라이드 — map id=1 첫 진입 시 1회만 노출. */
const TUTORIAL_SLIDES: ReadonlyArray<{
  readonly title: string;
  readonly body: ReadonlyArray<string>;
}> = [
  {
    title: "🎯 합 10 만들기",
    body: [
      "인접한 숫자를 드래그해서",
      "합이 정확히 10이 되도록 만드세요.",
      "조건이 맞으면 블럭이 사라집니다.",
    ],
  },
  {
    title: "📏 선택 규칙",
    body: [
      "상하좌우 인접 셀만 선택 가능 (대각선 X)",
      "2개 또는 3개의 셀을 연결",
      "합은 반드시 정확히 10",
    ],
  },
  {
    title: "⭐ 점수와 별",
    body: [
      "2개 매치 = +100점",
      "3개 매치 = +250점",
      "시간 내 ★1 이상이면 클리어!",
    ],
  },
];

export class GameScene implements Scene {
  private readonly context: SceneContext;
  private readonly boardRenderer: BoardRenderer;
  private readonly uiRenderer: UIRenderer;
  private readonly randomFn: () => number;
  private readonly introDurationMs: number;

  private map: MapData | null;
  private board: Board | null;
  private selector: Selector | null;
  private timer: Timer | null;
  private hint: Hint | null;
  private uiLayout: UILayout;
  private score: number;
  private ended: boolean;
  private pressedHintBtn: boolean;
  private pressedPauseBtn: boolean;
  private pressedPauseMenuBtn: "resume" | "restart" | "exit" | null;
  private introMsLeft: number;
  private paused: boolean;
  private pauseMenuLayout: ReturnType<typeof computePauseMenuLayout> | null;
  private tutorialActive: boolean;
  /** 1..TUTORIAL_SLIDES (활성 시), 0 (비활성). */
  private tutorialSlide: number;
  private pressedTutorialSkip: boolean;
  private tutorialSkipBtn: ButtonRect | null;

  constructor(
    context: SceneContext,
    randomFn: () => number = Math.random,
    introDurationMs: number = DEFAULT_INTRO_MS,
  ) {
    this.context = context;
    this.boardRenderer = new BoardRenderer(context.renderer);
    this.uiRenderer = new UIRenderer(context.renderer);
    this.randomFn = randomFn;
    this.introDurationMs = Math.max(0, introDurationMs);
    this.map = null;
    this.board = null;
    this.selector = null;
    this.timer = null;
    this.hint = null;
    this.uiLayout = computeUILayout(1, 1);
    this.score = 0;
    this.ended = false;
    this.pressedHintBtn = false;
    this.pressedPauseBtn = false;
    this.pressedPauseMenuBtn = null;
    this.introMsLeft = 0;
    this.paused = false;
    this.pauseMenuLayout = null;
    this.tutorialActive = false;
    this.tutorialSlide = 0;
    this.pressedTutorialSkip = false;
    this.tutorialSkipBtn = null;
  }

  async enter(args?: unknown): Promise<void> {
    const a = args as GameSceneArgs | undefined;
    if (!a?.map) throw new Error("GameScene.enter: map 인자 필요.");
    this.map = a.map;
    this.setupGame(a.resumeFrom);
    this.recomputeLayout();
    this.context.renderer.onResize(() => this.recomputeLayout());
    this.attachVisibilityListener();
    // 세션 복원이면 인트로 없이 즉시 일시정지 메뉴 노출 (이어하기 / 다시하기 / 메인).
    if (a.resumeFrom) {
      this.pauseGame();
      return;
    }
    // map id=1 첫 진입(튜토리얼 미완료) 시 튜토리얼 오버레이를 인트로 앞에 노출.
    if (a.map.id === 1) {
      const done = await this.context.saveManager.isTutorialDone();
      if (!done) this.startTutorial();
    }
  }

  /**
   * 현재 `this.map`을 기반으로 게임 상태를 초기화/재초기화한다.
   * `resumeFrom`이 주어지면 해당 스냅샷(보드/점수/남은 시간/남은 힌트)으로 복원한다.
   */
  private setupGame(resumeFrom?: ProgressRecord): void {
    if (!this.map) return;
    const initialBoard = resumeFrom?.boardState ?? this.map.initialBoard;
    const initialLives = resumeFrom?.boardLives ?? this.map.initialLives;
    this.board = new Board(initialBoard, initialLives);
    this.selector = new Selector(this.board);
    this.timer = new Timer(this.map.timeLimit);
    if (resumeFrom) {
      const remainingMs = Math.max(0, resumeFrom.timeLeft) * 1000;
      const elapsedMs = Math.max(0, this.timer.getLimitMs() - remainingMs);
      this.timer.setElapsedMs(elapsedMs);
    }
    const hintCount = resumeFrom?.hintsLeft ?? this.map.hintCount;
    this.hint = new Hint(this.board, hintCount);
    this.score = resumeFrom?.score ?? 0;
    this.ended = false;
    this.pressedHintBtn = false;
    this.pressedPauseBtn = false;
    this.pressedPauseMenuBtn = null;
    this.paused = false;
    this.introMsLeft = resumeFrom ? 0 : this.introDurationMs;
    this.timer.onExpired(() => this.endGame("timeup"));
    // 복원 경로는 caller(`enter`)에서 즉시 pauseGame 으로 전환되므로 여기서 timer.start 호출 안 함.
    if (this.introMsLeft <= 0 && !resumeFrom) this.timer.start();
  }

  private isInIntro(): boolean {
    return this.introMsLeft > 0;
  }

  private dismissIntro(): void {
    if (this.introMsLeft > 0) {
      this.introMsLeft = 0;
      this.timer?.start();
    }
  }

  private isInTutorial(): boolean {
    return this.tutorialActive;
  }

  private startTutorial(): void {
    this.tutorialActive = true;
    this.tutorialSlide = 1;
    this.pressedTutorialSkip = false;
  }

  /** 슬라이드 전진. 마지막 슬라이드에서 호출되면 튜토리얼 종료. */
  private advanceTutorial(): void {
    if (!this.tutorialActive) return;
    if (this.tutorialSlide < TUTORIAL_SLIDES.length) {
      this.tutorialSlide += 1;
    } else {
      this.endTutorial();
    }
  }

  private endTutorial(): void {
    if (!this.tutorialActive) return;
    this.tutorialActive = false;
    this.tutorialSlide = 0;
    this.pressedTutorialSkip = false;
    this.tutorialSkipBtn = null;
    void this.context.saveManager.markTutorialDone();
  }

  pauseGame(): void {
    if (this.paused || this.ended || this.isInIntro() || this.isInTutorial()) return;
    this.paused = true;
    this.timer?.pause();
    this.selector?.cancel();
    this.hint?.clear();
    this.pressedHintBtn = false;
    this.computePauseMenu();
    this.persistSaveSession();
  }

  resumeGame(): void {
    if (!this.paused || this.ended) return;
    this.paused = false;
    this.timer?.resume();
    this.pressedPauseMenuBtn = null;
    // 세션은 일부러 유지 — 다시 일시정지/탭전환 시 갱신, 정상 종료 시 endGame에서 삭제.
  }

  /** 현재 맵을 재시작 (점수/보드/타이머 리셋, 인트로 재표시). 진행 중 세션은 폐기. */
  restartMap(): void {
    if (!this.map) return;
    this.persistClearSession(this.map.id);
    this.setupGame();
  }

  /** 타이틀로 이동. 진행 중 세션은 폐기 (사용자가 명시적으로 나가는 선택). */
  private goToTitle(): void {
    if (this.map) this.persistClearSession(this.map.id);
    this.ended = true; // update()/입력 처리 중단
    this.context.transition("title");
  }

  /** 현재 진행 상태를 세션 스토어에 저장(fire-and-forget). */
  private persistSaveSession(): void {
    if (!this.map || !this.board || !this.timer || !this.hint) return;
    const record: ProgressRecord = {
      mapId: this.map.id,
      boardState: this.board.snapshot(),
      boardLives: this.board.livesSnapshot(),
      score: this.score,
      stars: computeStars(this.score, this.map.starThresholds),
      timeLeft: this.timer.getRemainingSeconds(),
      hintsLeft: this.hint.getRemaining(),
      timestamp: Date.now(),
    };
    void this.context.saveManager.saveSession(record);
  }

  private persistClearSession(mapId: number): void {
    void this.context.saveManager.clearSession(mapId);
  }

  /** 탭/창 전환·홈버튼·화면잠금 등 visibility hidden 시 자동 일시정지. */
  private onVisibilityChange = (): void => {
    if (typeof document === "undefined") return;
    if (document.hidden) this.pauseGame();
  };

  private attachVisibilityListener(): void {
    if (typeof document === "undefined") return;
    document.addEventListener("visibilitychange", this.onVisibilityChange);
  }

  private detachVisibilityListener(): void {
    if (typeof document === "undefined") return;
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
  }

  private computePauseMenu(): void {
    const size = this.context.renderer.getSize();
    this.pauseMenuLayout = computePauseMenuLayout(
      size.width,
      size.height,
      this.uiLayout.uiHeight,
    );
  }

  isPaused(): boolean {
    return this.paused;
  }

  exit(): void {
    this.detachVisibilityListener();
    this.timer?.pause();
    this.paused = false;
    this.pressedHintBtn = false;
    this.pressedPauseBtn = false;
    this.pressedPauseMenuBtn = null;
  }

  private recomputeLayout(): void {
    if (!this.map) return;
    const size = this.context.renderer.getSize();
    this.uiLayout = computeUILayout(size.width, size.height);
    const bounds = {
      x: 0,
      y: this.uiLayout.uiHeight,
      width: size.width,
      height: Math.max(0, size.height - this.uiLayout.uiHeight),
    };
    const layout = computeBoardLayout(bounds, this.map.cols, this.map.rows);
    this.boardRenderer.setLayout(layout);
    if (this.paused) this.computePauseMenu();
  }

  update(deltaMs: number): void {
    if (this.ended) return;
    if (this.isInTutorial()) return; // 튜토리얼 중에는 시간/인트로 진행 모두 정지
    if (this.isInIntro()) {
      this.introMsLeft -= deltaMs;
      if (this.introMsLeft <= 0) {
        this.introMsLeft = 0;
        this.timer?.start();
      }
      return;
    }
    if (this.paused) return;
    this.timer?.tick(deltaMs);
    this.hint?.tick(deltaMs);
  }

  render(): void {
    const r = this.context.renderer;
    r.clear("#101820");
    if (!this.board || !this.selector || !this.hint || !this.timer || !this.map) return;
    const selection = this.selector.getPositions();
    const invalid =
      selection.length >= 2 && !this.selector.isValidForRemoval();
    this.boardRenderer.draw(this.board, {
      selection,
      invalidSelection: invalid,
      highlight: this.hint.getHighlighted(),
    });
    const limitMs = this.timer.getLimitMs();
    const timeProgress =
      limitMs > 0 ? this.timer.getRemainingMs() / limitMs : 0;
    const stars = computeStars(this.score, this.map.starThresholds);
    this.uiRenderer.drawHUD(this.uiLayout, {
      timeProgress,
      score: this.score,
      stars,
      hintsLeft: this.hint.getRemaining(),
      highlighting: this.hint.isHighlighting(),
      paused: this.paused,
    });
    if (this.isInTutorial()) this.drawTutorialOverlay();
    else if (this.isInIntro()) this.drawIntroOverlay();
    else if (this.paused) this.drawPauseOverlay();
  }

  private drawPauseOverlay(): void {
    if (!this.pauseMenuLayout) this.computePauseMenu();
    const layout = this.pauseMenuLayout;
    if (!layout) return;
    const ctx = this.context.renderer.getCtx();
    const { width, height } = this.context.renderer.getSize();

    // 반투명 배경 (HUD 제외 영역)
    ctx.fillStyle = "rgba(16, 24, 32, 0.86)";
    ctx.fillRect(0, this.uiLayout.uiHeight, width, height - this.uiLayout.uiHeight);

    // 헤드라인
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#e0e6ee";
    ctx.font = `bold ${layout.titleFontPx}px -apple-system, "Segoe UI Emoji", sans-serif`;
    ctx.fillText("⏸ 일시정지", width / 2, layout.titleY);

    // 3개 버튼
    this.drawPauseMenuButton(ctx, layout.resume, "resume", "▶  재개");
    this.drawPauseMenuButton(ctx, layout.restart, "restart", "🔁  다시하기");
    this.drawPauseMenuButton(ctx, layout.exit, "exit", "🏠  메인");
  }

  private drawPauseMenuButton(
    ctx: CanvasRenderingContext2D,
    rect: ButtonRect,
    id: "resume" | "restart" | "exit",
    label: string,
  ): void {
    const pressed = this.pressedPauseMenuBtn === id;
    const bg = pressed ? "#4c566a" : "#3b4252";
    ctx.fillStyle = bg;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    ctx.strokeStyle = "#5d6872";
    ctx.lineWidth = 1;
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1);
    ctx.fillStyle = "#eceff4";
    const fontPx = Math.round(rect.height * 0.42);
    ctx.font = `600 ${fontPx}px -apple-system, "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, rect.x + rect.width / 2, rect.y + rect.height / 2);
  }

  private hitPauseMenuButton(x: number, y: number): "resume" | "restart" | "exit" | null {
    if (!this.pauseMenuLayout) return null;
    if (hitButton(this.pauseMenuLayout.resume, x, y)) return "resume";
    if (hitButton(this.pauseMenuLayout.restart, x, y)) return "restart";
    if (hitButton(this.pauseMenuLayout.exit, x, y)) return "exit";
    return null;
  }

  private drawTutorialOverlay(): void {
    const ctx = this.context.renderer.getCtx();
    const { width, height } = this.context.renderer.getSize();
    // 반투명 배경
    ctx.fillStyle = "rgba(16, 24, 32, 0.92)";
    ctx.fillRect(0, 0, width, height);

    const slideIdx = Math.max(1, Math.min(TUTORIAL_SLIDES.length, this.tutorialSlide));
    const slide = TUTORIAL_SLIDES[slideIdx - 1];
    const isLast = slideIdx === TUTORIAL_SLIDES.length;

    const minDim = Math.min(width, height);
    const titleFont = Math.round(minDim * 0.06);
    const bodyFont = Math.round(minDim * 0.04);
    const footerFont = Math.round(minDim * 0.032);
    const indicatorFont = Math.round(minDim * 0.03);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const cx = width / 2;
    let y = height * 0.28;

    // 제목
    ctx.fillStyle = "#e0e6ee";
    ctx.font = `bold ${titleFont}px -apple-system, "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
    ctx.fillText(slide.title, cx, y);

    // 본문
    y += titleFont * 1.4;
    ctx.fillStyle = "#cdd5df";
    ctx.font = `${bodyFont}px -apple-system, sans-serif`;
    const lineGap = Math.round(bodyFont * 1.6);
    for (const line of slide.body) {
      ctx.fillText(line, cx, y);
      y += lineGap;
    }

    // 페이지 인디케이터 (●○○ 형식)
    y += lineGap * 0.6;
    ctx.font = `${indicatorFont}px -apple-system, sans-serif`;
    ctx.fillStyle = "#7f8ea0";
    let indicator = "";
    for (let i = 1; i <= TUTORIAL_SLIDES.length; i++) {
      indicator += i === slideIdx ? "●" : "○";
      if (i < TUTORIAL_SLIDES.length) indicator += " ";
    }
    ctx.fillText(indicator, cx, y);

    // 하단 안내
    y += lineGap * 1.2;
    ctx.fillStyle = "#a3b3c2";
    ctx.font = `${footerFont}px -apple-system, sans-serif`;
    ctx.fillText(isLast ? "탭해서 시작" : "탭해서 다음", cx, y);

    // 우상단 "건너뛰기" 버튼
    const skipPadX = Math.round(minDim * 0.04);
    const skipPadY = Math.round(minDim * 0.025);
    const skipFont = Math.round(minDim * 0.034);
    ctx.font = `600 ${skipFont}px -apple-system, sans-serif`;
    const label = "건너뛰기";
    const labelW = Math.round(skipFont * label.length * 0.7);
    const btnW = labelW + skipPadX * 2;
    const btnH = Math.round(skipFont * 1.8);
    const btnX = width - btnW - Math.round(minDim * 0.03);
    const btnY = Math.round(minDim * 0.03);
    this.tutorialSkipBtn = { x: btnX, y: btnY, width: btnW, height: btnH };

    const pressed = this.pressedTutorialSkip;
    ctx.fillStyle = pressed ? "#4c566a" : "#3b4252";
    ctx.fillRect(btnX, btnY, btnW, btnH);
    ctx.strokeStyle = "#5d6872";
    ctx.lineWidth = 1;
    ctx.strokeRect(btnX + 0.5, btnY + 0.5, btnW - 1, btnH - 1);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#eceff4";
    ctx.fillText(label, btnX + btnW / 2, btnY + btnH / 2 + Math.round(skipPadY * 0.1));

    void skipPadY;
  }

  private drawIntroOverlay(): void {
    if (!this.map) return;
    const ctx = this.context.renderer.getCtx();
    const { width, height } = this.context.renderer.getSize();
    // 반투명 배경
    ctx.fillStyle = "rgba(16, 24, 32, 0.92)";
    ctx.fillRect(0, 0, width, height);

    const mapTitleFont = Math.round(Math.min(width, height) * 0.06);
    const bodyFont = Math.round(Math.min(width, height) * 0.045);
    const footerFont = Math.round(Math.min(width, height) * 0.032);
    const lineGap = Math.round(bodyFont * 1.6);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const cx = width / 2;
    let y = height * 0.28;

    ctx.fillStyle = "#e0e6ee";
    ctx.font = `bold ${mapTitleFont}px -apple-system, sans-serif`;
    ctx.fillText(`맵 ${this.map.id}: ${this.map.name}`, cx, y);

    y += mapTitleFont * 1.2;
    ctx.font = `${footerFont}px -apple-system, sans-serif`;
    ctx.fillStyle = "#a3b3c2";
    ctx.fillText("목표 점수", cx, y);

    y += footerFont * 1.6;
    const [s1, s2, s3] = this.map.starThresholds;
    const starFont = `${bodyFont}px -apple-system, "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
    ctx.font = starFont;

    ctx.fillStyle = "#ebcb8b";
    ctx.fillText(`★        ${s1}`, cx, y);
    y += lineGap;
    ctx.fillText(`★ ★       ${s2}`, cx, y);
    y += lineGap;
    ctx.fillText(`★ ★ ★      ${s3}`, cx, y);

    y += lineGap * 1.2;
    ctx.fillStyle = "#7f8ea0";
    ctx.font = `${footerFont}px -apple-system, sans-serif`;
    const remainSec = Math.ceil(this.introMsLeft / 1000);
    ctx.fillText(`화면을 탭하거나 ${remainSec}초 후 시작`, cx, y);
  }

  onPointerDown(x: number, y: number): void {
    if (this.ended || !this.selector || !this.hint) return;
    if (this.isInTutorial()) {
      // 건너뛰기 버튼 press → release 인 바운스용으로 마킹.
      if (this.tutorialSkipBtn && hitButton(this.tutorialSkipBtn, x, y)) {
        this.pressedTutorialSkip = true;
      }
      return;
    }
    if (this.isInIntro()) {
      this.dismissIntro();
      return;
    }
    if (y < this.uiLayout.uiHeight) {
      if (isPauseButtonHit(this.uiLayout, x, y)) {
        this.pressedPauseBtn = true;
      } else if (!this.paused && isHintButtonHit(this.uiLayout, x, y)) {
        this.pressedHintBtn = true;
      }
      return;
    }
    if (this.paused) {
      // 일시정지 오버레이의 버튼 영역 press.
      this.pressedPauseMenuBtn = this.hitPauseMenuButton(x, y);
      return;
    }
    const layout = this.boardRenderer.getLayout();
    const p = hitTestCell(layout, x, y);
    if (!p) return;
    if (this.selector.begin(p[0], p[1])) {
      this.context.audio.play("select");
    }
  }

  onPointerMove(x: number, y: number): void {
    if (
      this.ended ||
      this.isInTutorial() ||
      this.isInIntro() ||
      this.paused ||
      !this.selector ||
      !this.selector.isActive()
    ) {
      return;
    }
    const layout = this.boardRenderer.getLayout();
    const p = hitTestCell(layout, x, y);
    if (!p) return;
    const changed = this.selector.extend(p[0], p[1]);
    if (changed) this.context.audio.play("select");
  }

  onPointerUp(x: number = Number.NaN, y: number = Number.NaN): void {
    if (this.ended) return;

    // 튜토리얼 중: 건너뛰기 버튼 인 바운스 → 즉시 종료, 아니면 슬라이드 전진.
    if (this.isInTutorial()) {
      if (this.pressedTutorialSkip) {
        this.pressedTutorialSkip = false;
        const hit =
          !Number.isFinite(x) || !Number.isFinite(y)
            ? true
            : this.tutorialSkipBtn !== null && hitButton(this.tutorialSkipBtn, x, y);
        if (hit) this.endTutorial();
        return;
      }
      // 일반 영역 탭 → 다음 슬라이드 또는 종료
      this.advanceTutorial();
      return;
    }

    // 일시정지 버튼 press → release 인 바운스
    if (this.pressedPauseBtn) {
      this.pressedPauseBtn = false;
      const hit = !Number.isFinite(x) || !Number.isFinite(y)
        ? true
        : isPauseButtonHit(this.uiLayout, x, y);
      if (hit) {
        this.context.audio.play("button");
        if (this.paused) this.resumeGame();
        else this.pauseGame();
      }
      return;
    }

    if (this.pressedHintBtn) {
      const pressed = this.pressedHintBtn;
      this.pressedHintBtn = false;
      if (pressed && Number.isFinite(x) && Number.isFinite(y)) {
        if (isHintButtonHit(this.uiLayout, x, y)) {
          this.requestHint();
        }
      } else if (pressed) {
        this.requestHint();
      }
      return;
    }

    // 일시정지 오버레이 버튼 press → release 인 바운스
    if (this.pressedPauseMenuBtn) {
      const btn = this.pressedPauseMenuBtn;
      this.pressedPauseMenuBtn = null;
      if (!Number.isFinite(x) || !Number.isFinite(y) || this.hitPauseMenuButton(x, y) === btn) {
        this.context.audio.play("button");
        if (btn === "resume") this.resumeGame();
        else if (btn === "restart") this.restartMap();
        else if (btn === "exit") this.goToTitle();
      }
      return;
    }

    if (this.paused) return;
    if (!this.selector || !this.board) return;
    const result = this.selector.commit();
    if (result.valid) {
      this.board.applyMatch(result.positions);
      this.board.applyGravity();
      this.board.refill(this.randomFn);
      this.hint?.clear();
      this.score += result.positions.length === 2 ? SCORE_PAIR : SCORE_TRIPLE;
      this.context.audio.play("remove");
      if (findValidCombination(this.board) === null) {
        this.endGame("stuck");
      }
    } else if (result.positions.length >= 2) {
      this.context.audio.play("invalid");
    }
  }

  onPointerCancel(): void {
    this.pressedHintBtn = false;
    this.pressedPauseBtn = false;
    this.pressedPauseMenuBtn = null;
    this.pressedTutorialSkip = false;
    this.selector?.cancel();
  }

  private requestHint(): void {
    if (!this.hint) return;
    const combo = this.hint.request();
    if (combo) this.context.audio.play("hint");
    else this.context.audio.play("invalid");
  }

  private endGame(reason: GameEndReason): void {
    if (this.ended || !this.timer || !this.map) return;
    this.ended = true;
    this.persistClearSession(this.map.id);
    this.timer.pause();
    const finalScore = this.score;
    const stars = computeStars(finalScore, this.map.starThresholds);
    const cleared = stars >= 1;
    if (cleared) {
      this.context.audio.play("clear");
    } else {
      this.context.audio.play("gameover");
    }
    const result: GameResult = {
      mapId: this.map.id,
      mapName: this.map.name,
      cleared,
      score: finalScore,
      stars,
      timeLeft: this.timer.getRemainingSeconds(),
      reason,
      starThresholds: this.map.starThresholds,
    };
    this.context.transition("result", result);
  }

  // --- 테스트/디버그용 접근자 ---
  _getScore(): number {
    return this.score;
  }
  _isEnded(): boolean {
    return this.ended;
  }
  _isInIntro(): boolean {
    return this.isInIntro();
  }
  _dismissIntro(): void {
    this.dismissIntro();
  }
  _isCleared(): boolean {
    return this.board?.isCleared() ?? false;
  }
  _isInTutorial(): boolean {
    return this.isInTutorial();
  }
  _getTutorialSlide(): number {
    return this.tutorialSlide;
  }
  _getTutorialSkipBtn(): ButtonRect | null {
    return this.tutorialSkipBtn;
  }
}

// starsString 는 ResultScene 등에서 직접 사용.
export { starsString };
