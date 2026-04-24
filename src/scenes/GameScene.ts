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

export interface GameSceneArgs {
  readonly map: MapData;
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
  private introMsLeft: number;
  private paused: boolean;

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
    this.introMsLeft = 0;
    this.paused = false;
  }

  async enter(args?: unknown): Promise<void> {
    const a = args as GameSceneArgs | undefined;
    if (!a?.map) throw new Error("GameScene.enter: map 인자 필요.");
    this.map = a.map;
    this.board = new Board(a.map.initialBoard);
    this.selector = new Selector(this.board);
    this.timer = new Timer(a.map.timeLimit);
    this.hint = new Hint(this.board, a.map.hintCount);
    this.score = 0;
    this.ended = false;
    this.pressedHintBtn = false;
    this.pressedPauseBtn = false;
    this.paused = false;
    this.introMsLeft = this.introDurationMs;
    this.timer.onExpired(() => this.endGame("timeup"));
    // 인트로 오버레이가 없으면 즉시 시작, 있으면 인트로가 끝난 뒤 start.
    if (this.introMsLeft <= 0) this.timer.start();
    this.recomputeLayout();
    this.context.renderer.onResize(() => this.recomputeLayout());
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

  pauseGame(): void {
    if (this.paused || this.ended || this.isInIntro()) return;
    this.paused = true;
    this.timer?.pause();
    this.selector?.cancel();
    this.hint?.clear();
    this.pressedHintBtn = false;
  }

  resumeGame(): void {
    if (!this.paused || this.ended) return;
    this.paused = false;
    this.timer?.resume();
  }

  isPaused(): boolean {
    return this.paused;
  }

  exit(): void {
    this.timer?.pause();
    this.paused = false;
    this.pressedHintBtn = false;
    this.pressedPauseBtn = false;
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
  }

  update(deltaMs: number): void {
    if (this.ended) return;
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
    if (this.isInIntro()) this.drawIntroOverlay();
    else if (this.paused) this.drawPauseOverlay();
  }

  private drawPauseOverlay(): void {
    const ctx = this.context.renderer.getCtx();
    const { width, height } = this.context.renderer.getSize();
    ctx.fillStyle = "rgba(16, 24, 32, 0.82)";
    ctx.fillRect(0, this.uiLayout.uiHeight, width, height - this.uiLayout.uiHeight);

    const titleFont = Math.round(Math.min(width, height) * 0.08);
    const bodyFont = Math.round(Math.min(width, height) * 0.035);
    const cx = width / 2;
    const cy = (height + this.uiLayout.uiHeight) / 2;

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#e0e6ee";
    ctx.font = `bold ${titleFont}px -apple-system, "Segoe UI Emoji", sans-serif`;
    ctx.fillText("⏸ 일시정지", cx, cy - titleFont * 0.3);

    ctx.fillStyle = "#a3b3c2";
    ctx.font = `${bodyFont}px -apple-system, sans-serif`;
    ctx.fillText("▶ 버튼을 누르거나 화면을 탭하세요", cx, cy + titleFont * 0.8);
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
    if (this.isInIntro()) {
      this.dismissIntro();
      return;
    }
    if (y < this.uiLayout.uiHeight) {
      // HUD 영역 — 일시정지/힌트 버튼 press 시작.
      if (isPauseButtonHit(this.uiLayout, x, y)) {
        this.pressedPauseBtn = true;
      } else if (!this.paused && isHintButtonHit(this.uiLayout, x, y)) {
        this.pressedHintBtn = true;
      }
      return;
    }
    if (this.paused) {
      // 보드 영역 탭 → 재개.
      this.context.audio.play("button");
      this.resumeGame();
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

    if (this.paused) return;
    if (!this.selector || !this.board) return;
    const result = this.selector.commit();
    if (result.valid) {
      this.board.clearCells(result.positions);
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
}

// starsString 는 ResultScene 등에서 직접 사용.
export { starsString };
