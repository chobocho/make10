/**
 * UIRenderer — 상단 HUD(타이머·점수·힌트 버튼) + 오버레이 도움 함수.
 *
 * 좌표/크기는 뷰포트 비율 기반이며, 너무 작아지거나 커지지 않도록 clamp 한다
 * (CLAUDE.md §5-2: 하드코딩된 좌표 금지, 비율 계산 + 모바일 대응).
 */
import type { CanvasRenderer } from "./CanvasRenderer";

export interface UIButtonRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface UILayout {
  /** HUD 전체 높이 (타이머 바 + 메인 HUD). 보드 상단 오프셋으로 사용. */
  readonly uiHeight: number;
  /** 뷰포트 최상단에 위치한 무지개 타이머 바 영역. */
  readonly timerBar: UIButtonRect;
  /** 메인 HUD 시작 y (= 타이머 바 아래). */
  readonly hudY: number;
  readonly hintButton: UIButtonRect;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function computeUILayout(viewWidth: number, viewHeight: number): UILayout {
  const barHeight = Math.round(clamp(viewHeight * 0.014, 6, 14));
  const hudHeight = Math.round(clamp(viewHeight * 0.1, 60, 110));
  const uiHeight = barHeight + hudHeight;
  const btnW = Math.round(clamp(viewWidth * 0.25, 96, 160));
  const btnH = Math.round(hudHeight * 0.72);
  const margin = Math.round(hudHeight * 0.18);
  const btnX = viewWidth - btnW - margin;
  const btnY = barHeight + Math.round((hudHeight - btnH) / 2);
  return {
    uiHeight,
    timerBar: { x: 0, y: 0, width: viewWidth, height: barHeight },
    hudY: barHeight,
    hintButton: { x: btnX, y: btnY, width: btnW, height: btnH },
  };
}

export function isHintButtonHit(layout: UILayout, x: number, y: number): boolean {
  const b = layout.hintButton;
  return x >= b.x && x < b.x + b.width && y >= b.y && y < b.y + b.height;
}

export interface HUDState {
  /** 남은 시간 비율 (0..1, 1=가득). 타이머 무지개 바에 사용. */
  readonly timeProgress: number;
  readonly score: number;
  /** 현재까지 획득한 별 수 (0~3). */
  readonly stars?: number;
  readonly hintsLeft: number;
  readonly highlighting?: boolean;
}

const COLOR_HUD_BG = "#1b222b";
const COLOR_BAR_BG = "#2a323c";
const COLOR_TEXT = "#e0e6ee";
const COLOR_BTN = "#4c566a";
const COLOR_BTN_DISABLED = "#2e3440";
const COLOR_BTN_ACTIVE = "#ebcb8b";

/** ROYGBIV 표준 7색 — 좌측이 '위험(빨강)'이 되도록 배치. */
const RAINBOW_STOPS: ReadonlyArray<readonly [number, string]> = [
  [0.0, "#ff3b30"],
  [0.17, "#ff9500"],
  [0.33, "#ffcc00"],
  [0.5, "#34c759"],
  [0.67, "#00c7be"],
  [0.83, "#007aff"],
  [1.0, "#af52de"],
];

export class UIRenderer {
  private readonly renderer: CanvasRenderer;

  constructor(renderer: CanvasRenderer) {
    this.renderer = renderer;
  }

  drawHUD(layout: UILayout, state: HUDState): void {
    const ctx = this.renderer.getCtx();
    const { width } = this.renderer.getSize();

    // 1) 타이머 무지개 바. 남은 비율만큼 왼쪽부터 채우므로,
    //    시간이 줄면 오른쪽(보라)부터 사라지고 결국 빨강만 남는다.
    const bar = layout.timerBar;
    ctx.fillStyle = COLOR_BAR_BG;
    ctx.fillRect(bar.x, bar.y, bar.width, bar.height);
    const progress = Math.max(0, Math.min(1, state.timeProgress));
    const filledW = bar.width * progress;
    if (filledW > 0) {
      const grad = ctx.createLinearGradient(
        bar.x,
        bar.y,
        bar.x + bar.width,
        bar.y,
      );
      for (const [stop, color] of RAINBOW_STOPS) {
        grad.addColorStop(stop, color);
      }
      ctx.fillStyle = grad;
      ctx.fillRect(bar.x, bar.y, filledW, bar.height);
    }

    // 2) 메인 HUD (바 아래 영역)
    const hudH = layout.uiHeight - layout.hudY;
    ctx.fillStyle = COLOR_HUD_BG;
    ctx.fillRect(0, layout.hudY, width, hudH);

    const fontPx = Math.round(hudH * 0.34);
    ctx.font = `${fontPx}px -apple-system, "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
    ctx.textBaseline = "middle";

    ctx.fillStyle = COLOR_TEXT;
    ctx.textAlign = "center";
    const stars = typeof state.stars === "number" ? Math.max(0, Math.min(3, state.stars)) : 0;
    const starsStr = "★".repeat(stars) + "☆".repeat(3 - stars);
    ctx.fillText(`🏆 ${state.score}  ${starsStr}`, width / 2, layout.hudY + hudH / 2);

    const b = layout.hintButton;
    const active = state.highlighting === true;
    ctx.fillStyle =
      state.hintsLeft <= 0 ? COLOR_BTN_DISABLED : active ? COLOR_BTN_ACTIVE : COLOR_BTN;
    ctx.fillRect(b.x, b.y, b.width, b.height);
    ctx.fillStyle = state.hintsLeft <= 0 ? "#4c566a" : COLOR_TEXT;
    ctx.fillText(`💡 ${state.hintsLeft}`, b.x + b.width / 2, b.y + b.height / 2);
  }

  drawCenteredText(text: string, cssFontPx: number, color = COLOR_TEXT): void {
    const ctx = this.renderer.getCtx();
    const { width, height } = this.renderer.getSize();
    ctx.fillStyle = color;
    ctx.font = `${cssFontPx}px -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, width / 2, height / 2);
  }
}
