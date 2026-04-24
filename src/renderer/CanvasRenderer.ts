/**
 * CanvasRenderer — HiDPI 대응 Canvas 래퍼.
 *
 * CSS 픽셀 단위로 그리되, 내부 canvas의 물리 픽셀 크기는 `devicePixelRatio`만큼 확대한다.
 * 그림 API는 CSS 좌표계 기준으로 호출하면 되도록 `setTransform(dpr,0,0,dpr,0,0)`을 적용한다.
 *
 * 브라우저 없는 환경(테스트)에서도 동작하도록 DOM 참조를 최소화했다 —
 * `attachToWindow` 만 전역 `window`에 의존한다.
 */
export interface RendererSize {
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
}

export class CanvasRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private cssWidth: number;
  private cssHeight: number;
  private dpr: number;
  private resizeCb: ((size: RendererSize) => void) | null;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("CanvasRenderer: 2D 컨텍스트를 얻을 수 없습니다.");
    }
    this.canvas = canvas;
    this.ctx = ctx;
    this.cssWidth = 0;
    this.cssHeight = 0;
    this.dpr = 1;
    this.resizeCb = null;
  }

  resize(cssWidth: number, cssHeight: number, dpr = 1): void {
    if (cssWidth <= 0 || cssHeight <= 0) {
      throw new Error(`CanvasRenderer.resize: 0 이하 크기 (${cssWidth}x${cssHeight}).`);
    }
    const d = dpr > 0 ? dpr : 1;
    this.cssWidth = cssWidth;
    this.cssHeight = cssHeight;
    this.dpr = d;
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
    this.canvas.width = Math.round(cssWidth * d);
    this.canvas.height = Math.round(cssHeight * d);
    this.ctx.setTransform(d, 0, 0, d, 0, 0);
    if (this.resizeCb) this.resizeCb(this.getSize());
  }

  /** 브라우저 window 크기/DPR에 자동 연동. */
  attachToWindow(w: Window = window): void {
    const apply = (): void => {
      const dpr = w.devicePixelRatio || 1;
      this.resize(w.innerWidth, w.innerHeight, dpr);
    };
    apply();
    w.addEventListener("resize", apply);
  }

  getSize(): RendererSize {
    return { width: this.cssWidth, height: this.cssHeight, dpr: this.dpr };
  }

  getCtx(): CanvasRenderingContext2D {
    return this.ctx;
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  clear(color?: string): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (color) {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    } else {
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    ctx.restore();
  }

  onResize(cb: (size: RendererSize) => void): void {
    this.resizeCb = cb;
  }
}
