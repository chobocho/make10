/**
 * Timer — 카운트다운 타이머.
 *
 * 특징:
 *   - 밀리초 기반 누적. `tick(deltaMs)`는 게임 루프에서 매 프레임 호출한다.
 *   - 만료 시 1회성으로 `onExpire` 콜백이 호출된다. 연타되지 않는다.
 *   - 일시정지/재개를 지원한다(`pause` / `resume`).
 *   - 실제 시계(`Date.now()`)에 의존하지 않아 테스트 및 `pauseGame`/`resumeGame`에 친화적.
 */
export class Timer {
  private readonly limitMs: number;
  private elapsedMs: number;
  private running: boolean;
  private expiredFlag: boolean;
  private onExpire: (() => void) | null;

  constructor(limitSeconds: number) {
    if (!Number.isFinite(limitSeconds) || limitSeconds < 0) {
      throw new Error(`Timer: 음수 또는 비유한 limit 초 (${limitSeconds}).`);
    }
    this.limitMs = Math.floor(limitSeconds * 1000);
    this.elapsedMs = 0;
    this.running = false;
    this.expiredFlag = false;
    this.onExpire = null;
  }

  start(): void {
    if (this.expiredFlag) return;
    this.running = true;
  }

  pause(): void {
    this.running = false;
  }

  resume(): void {
    if (this.expiredFlag) return;
    this.running = true;
  }

  reset(): void {
    this.elapsedMs = 0;
    this.expiredFlag = false;
    this.running = false;
  }

  /**
   * 경과 시간을 직접 설정한다(세션 복원용). 한도 이상이면 즉시 만료 처리한다.
   * 주: `onExpire` 콜백은 호출하지 않는다 — 복원은 만료 이벤트가 아니라 상태 재구성이므로.
   */
  setElapsedMs(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) {
      throw new Error(`Timer.setElapsedMs: 음수/비유한 값 (${ms}).`);
    }
    if (ms >= this.limitMs) {
      this.elapsedMs = this.limitMs;
      this.expiredFlag = true;
      this.running = false;
    } else {
      this.elapsedMs = ms;
    }
  }

  tick(deltaMs: number): void {
    if (!this.running || this.expiredFlag) return;
    if (deltaMs <= 0) return;
    this.elapsedMs += deltaMs;
    if (this.elapsedMs >= this.limitMs) {
      this.elapsedMs = this.limitMs;
      this.expiredFlag = true;
      this.running = false;
      if (this.onExpire) this.onExpire();
    }
  }

  onExpired(fn: () => void): void {
    this.onExpire = fn;
  }

  getLimitMs(): number {
    return this.limitMs;
  }

  getElapsedMs(): number {
    return this.elapsedMs;
  }

  getRemainingMs(): number {
    return Math.max(0, this.limitMs - this.elapsedMs);
  }

  /** UI 표시용 정수 초. 남은 시간이 0.1s 남아도 1초로 표시한다. */
  getRemainingSeconds(): number {
    return Math.ceil(this.getRemainingMs() / 1000);
  }

  isExpired(): boolean {
    return this.expiredFlag;
  }

  isRunning(): boolean {
    return this.running;
  }
}
