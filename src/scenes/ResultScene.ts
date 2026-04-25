/**
 * ResultScene — 결과 표시 + 다시/다음/타이틀 버튼.
 */
import type { Scene, SceneContext } from "./Scene";
import type { GameResult } from "./GameScene";
import type { ButtonRect } from "./SceneLayout";
import { computeResultButtonsLayout, hitButton } from "./SceneLayout";

const COLOR_BG = "#101820";
const COLOR_HEAD_WIN = "#a3be8c";
const COLOR_HEAD_LOSE = "#bf616a";
const COLOR_TEXT = "#e0e6ee";
const COLOR_BTN = "#3b4252";
const COLOR_BTN_HOVER = "#4c566a";
const COLOR_BTN_DISABLED = "#2e3440";
const COLOR_BTN_TEXT = "#eceff4";

type ButtonId = "retry" | "next" | "title";

export class ResultScene implements Scene {
  private readonly context: SceneContext;
  private result: GameResult | null;
  private buttons: {
    retry: ButtonRect;
    next: ButtonRect;
    title: ButtonRect;
  };
  private headlineFontPx: number;
  private bodyFontPx: number;
  private pressed: ButtonId | null;

  constructor(context: SceneContext) {
    this.context = context;
    this.result = null;
    this.buttons = {
      retry: { x: 0, y: 0, width: 0, height: 0 },
      next: { x: 0, y: 0, width: 0, height: 0 },
      title: { x: 0, y: 0, width: 0, height: 0 },
    };
    this.headlineFontPx = 48;
    this.bodyFontPx = 24;
    this.pressed = null;
  }

  enter(args?: unknown): void {
    this.result = (args as GameResult) ?? null;
    this.pressed = null;
    this.recomputeLayout();
    this.context.renderer.onResize(() => this.recomputeLayout());
    // ★1 이상 달성 시 기록 저장 (fire-and-forget). 기존보다 높은 점수만 유지.
    if (this.result && this.result.cleared) {
      void this.context.saveManager.saveBest({
        mapId: this.result.mapId,
        boardState: [],
        score: this.result.score,
        stars: this.result.stars,
        timeLeft: this.result.timeLeft,
        timestamp: Date.now(),
      });
    }
  }

  exit(): void {
    /* no-op */
  }

  update(_deltaMs: number): void {
    /* no-op */
  }

  private recomputeLayout(): void {
    const size = this.context.renderer.getSize();
    const l = computeResultButtonsLayout(size.width, size.height);
    this.buttons = { retry: l.retry, next: l.next, title: l.title };
    this.headlineFontPx = l.headlineFontPx;
    this.bodyFontPx = l.bodyFontPx;
  }

  render(): void {
    const r = this.context.renderer;
    r.clear(COLOR_BG);
    const ctx = r.getCtx();
    const { width, height } = r.getSize();
    const res = this.result;

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `bold ${this.headlineFontPx}px -apple-system, sans-serif`;
    ctx.fillStyle = res?.cleared ? COLOR_HEAD_WIN : COLOR_HEAD_LOSE;
    const headline =
      res?.cleared
        ? "🎉 클리어!"
        : res?.reason === "stuck"
          ? "🏁 진행 불가"
          : "⏱ 시간 초과";
    ctx.fillText(headline, width / 2, height * 0.22);

    // 획득 별 3개 단계 표시 — ★★★ / ★★☆ 등.
    if (res) {
      const starFontPx = Math.round(this.headlineFontPx * 0.9);
      ctx.fillStyle = "#ebcb8b";
      ctx.font = `${starFontPx}px -apple-system, "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
      const starsDisplay =
        "★".repeat(res.stars) + "☆".repeat(3 - res.stars);
      ctx.fillText(starsDisplay, width / 2, height * 0.36);
    }

    ctx.fillStyle = COLOR_TEXT;
    ctx.font = `${this.bodyFontPx}px -apple-system, sans-serif`;
    const lines: string[] = res
      ? [
          `${res.mapName}`,
          `점수: ${res.score}`,
        ]
      : [];
    let lineY = height * 0.5;
    for (const line of lines) {
      ctx.fillText(line, width / 2, lineY);
      lineY += this.bodyFontPx * 1.4;
    }

    // 각 별 단계 임계값 대비 달성 여부.
    if (res) {
      const thresholdFont = Math.round(this.bodyFontPx * 0.85);
      ctx.font = `${thresholdFont}px -apple-system, "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
      const [s1, s2, s3] = res.starThresholds;
      const tiers: Array<readonly [string, number]> = [
        ["★", s1],
        ["★★", s2],
        ["★★★", s3],
      ];
      lineY += this.bodyFontPx * 0.4;
      for (const [label, need] of tiers) {
        const achieved = res.score >= need;
        ctx.fillStyle = achieved ? "#a3be8c" : "#5d6872";
        const prefix = achieved ? "✓" : "·";
        ctx.fillText(`${prefix} ${label}  ${need}`, width / 2, lineY);
        lineY += thresholdFont * 1.4;
      }
    }

    const nextAvailable = this.hasNext();
    this.drawButton(ctx, "retry", "🔁 다시", false);
    this.drawButton(ctx, "next", "➡️ 다음", !nextAvailable);
    this.drawButton(ctx, "title", "🏠 타이틀", false);
  }

  private hasNext(): boolean {
    if (!this.result) return false;
    if (!this.result.cleared) return false; // 순차 잠금: 실패 시 다음 맵 진입 차단
    return this.result.mapId < this.context.maxMapId;
  }

  private drawButton(
    ctx: CanvasRenderingContext2D,
    id: ButtonId,
    label: string,
    disabled: boolean,
  ): void {
    const b = this.buttons[id];
    let fill = COLOR_BTN;
    if (disabled) fill = COLOR_BTN_DISABLED;
    else if (this.pressed === id) fill = COLOR_BTN_HOVER;
    ctx.fillStyle = fill;
    ctx.fillRect(b.x, b.y, b.width, b.height);
    ctx.fillStyle = disabled ? "#5d6872" : COLOR_BTN_TEXT;
    ctx.font = `bold ${Math.round(b.height * 0.4)}px -apple-system, "Segoe UI Emoji", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, b.x + b.width / 2, b.y + b.height / 2);
  }

  onPointerDown(x: number, y: number): void {
    if (hitButton(this.buttons.retry, x, y)) this.pressed = "retry";
    else if (hitButton(this.buttons.next, x, y) && this.hasNext()) this.pressed = "next";
    else if (hitButton(this.buttons.title, x, y)) this.pressed = "title";
    else this.pressed = null;
  }

  onPointerUp(x: number, y: number): void {
    const hit = this.pressed;
    this.pressed = null;
    if (!hit) return;
    const rect = this.buttons[hit];
    if (!hitButton(rect, x, y)) return;
    this.context.audio.play("button");
    if (hit === "title") {
      this.context.transition("title");
      return;
    }
    if (hit === "retry") {
      void this.goToMap(this.result?.mapId ?? 1);
      return;
    }
    if (hit === "next") {
      if (!this.hasNext() || !this.result) return;
      void this.goToMap(this.result.mapId + 1);
    }
  }

  onPointerCancel(): void {
    this.pressed = null;
  }

  private async goToMap(mapId: number): Promise<void> {
    try {
      const map = await this.context.loadMap(mapId);
      this.context.transition("game", { map });
    } catch (err) {
      console.error(`ResultScene: map ${mapId} 로드 실패`, err);
      this.context.transition("title");
    }
  }
}
