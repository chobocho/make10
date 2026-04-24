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
  readonly uiHeight: number;
  readonly hintButton: UIButtonRect;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function computeUILayout(viewWidth: number, viewHeight: number): UILayout {
  const uiHeight = Math.round(clamp(viewHeight * 0.1, 60, 110));
  const btnW = Math.round(clamp(viewWidth * 0.25, 96, 160));
  const btnH = Math.round(uiHeight * 0.72);
  const margin = Math.round(uiHeight * 0.18);
  const btnX = viewWidth - btnW - margin;
  const btnY = Math.round((uiHeight - btnH) / 2);
  return {
    uiHeight,
    hintButton: { x: btnX, y: btnY, width: btnW, height: btnH },
  };
}

export function isHintButtonHit(layout: UILayout, x: number, y: number): boolean {
  const b = layout.hintButton;
  return x >= b.x && x < b.x + b.width && y >= b.y && y < b.y + b.height;
}

export interface HUDState {
  readonly timeLeft: number;
  readonly score: number;
  readonly hintsLeft: number;
  readonly highlighting?: boolean;
}

const COLOR_HUD_BG = "#1b222b";
const COLOR_TEXT = "#e0e6ee";
const COLOR_BTN = "#4c566a";
const COLOR_BTN_DISABLED = "#2e3440";
const COLOR_BTN_ACTIVE = "#ebcb8b";

export class UIRenderer {
  private readonly renderer: CanvasRenderer;

  constructor(renderer: CanvasRenderer) {
    this.renderer = renderer;
  }

  drawHUD(layout: UILayout, state: HUDState): void {
    const ctx = this.renderer.getCtx();
    const { width } = this.renderer.getSize();
    ctx.fillStyle = COLOR_HUD_BG;
    ctx.fillRect(0, 0, width, layout.uiHeight);

    const fontPx = Math.round(layout.uiHeight * 0.34);
    ctx.font = `${fontPx}px -apple-system, "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
    ctx.textBaseline = "middle";

    ctx.fillStyle = COLOR_TEXT;
    ctx.textAlign = "left";
    const padX = Math.round(layout.uiHeight * 0.25);
    ctx.fillText(`⏱ ${state.timeLeft}`, padX, layout.uiHeight / 2);

    ctx.textAlign = "center";
    ctx.fillText(`🏆 ${state.score}`, width / 2, layout.uiHeight / 2);

    const b = layout.hintButton;
    const active = state.highlighting === true;
    ctx.fillStyle = state.hintsLeft <= 0 ? COLOR_BTN_DISABLED : active ? COLOR_BTN_ACTIVE : COLOR_BTN;
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
