/**
 * PointerInput — 마우스+터치 통합 드래그 이벤트.
 *
 * Pointer Events API로 mouse/touch/pen을 공통 처리한다. 활성 포인터는 1개만 추적.
 * 좌표는 대상 엘리먼트의 `getBoundingClientRect()` 기준 CSS 픽셀로 변환한다.
 */
export interface PointerInputHandlers {
  readonly onDown?: (x: number, y: number) => void;
  readonly onMove?: (x: number, y: number) => void;
  readonly onUp?: (x: number, y: number) => void;
  readonly onCancel?: () => void;
}

interface EventTargetLike {
  addEventListener(type: string, listener: (e: PointerEvent) => void): void;
  removeEventListener(type: string, listener: (e: PointerEvent) => void): void;
  getBoundingClientRect(): { left: number; top: number };
  setPointerCapture?(id: number): void;
  releasePointerCapture?(id: number): void;
}

export class PointerInput {
  private readonly target: EventTargetLike;
  private handlers: PointerInputHandlers;
  private activePointerId: number | null;
  private attached: boolean;

  constructor(target: EventTargetLike, handlers: PointerInputHandlers = {}) {
    this.target = target;
    this.handlers = handlers;
    this.activePointerId = null;
    this.attached = false;
  }

  setHandlers(handlers: PointerInputHandlers): void {
    this.handlers = handlers;
  }

  attach(): void {
    if (this.attached) return;
    this.target.addEventListener("pointerdown", this.onDown);
    this.target.addEventListener("pointermove", this.onMove);
    this.target.addEventListener("pointerup", this.onUp);
    this.target.addEventListener("pointercancel", this.onCancel);
    this.target.addEventListener("pointerleave", this.onCancel);
    this.attached = true;
  }

  detach(): void {
    if (!this.attached) return;
    this.target.removeEventListener("pointerdown", this.onDown);
    this.target.removeEventListener("pointermove", this.onMove);
    this.target.removeEventListener("pointerup", this.onUp);
    this.target.removeEventListener("pointercancel", this.onCancel);
    this.target.removeEventListener("pointerleave", this.onCancel);
    this.attached = false;
  }

  private localCoords(e: PointerEvent): { x: number; y: number } {
    const rect = this.target.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private onDown = (e: PointerEvent): void => {
    if (this.activePointerId !== null) return;
    this.activePointerId = e.pointerId;
    if (this.target.setPointerCapture) {
      try {
        this.target.setPointerCapture(e.pointerId);
      } catch {
        /* 무시 — 일부 환경에서 캡처 실패 */
      }
    }
    if (typeof e.preventDefault === "function") e.preventDefault();
    const { x, y } = this.localCoords(e);
    this.handlers.onDown?.(x, y);
  };

  private onMove = (e: PointerEvent): void => {
    if (this.activePointerId !== e.pointerId) return;
    if (typeof e.preventDefault === "function") e.preventDefault();
    const { x, y } = this.localCoords(e);
    this.handlers.onMove?.(x, y);
  };

  private onUp = (e: PointerEvent): void => {
    if (this.activePointerId !== e.pointerId) return;
    this.activePointerId = null;
    if (this.target.releasePointerCapture) {
      try {
        this.target.releasePointerCapture(e.pointerId);
      } catch {
        /* 무시 */
      }
    }
    if (typeof e.preventDefault === "function") e.preventDefault();
    const { x, y } = this.localCoords(e);
    this.handlers.onUp?.(x, y);
  };

  private onCancel = (e: PointerEvent): void => {
    if (this.activePointerId !== e.pointerId) return;
    this.activePointerId = null;
    this.handlers.onCancel?.();
  };

  /** 현재 드래그 중인지 여부. */
  isActive(): boolean {
    return this.activePointerId !== null;
  }
}
