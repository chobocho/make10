import {
  describe,
  test,
  assertEqual,
  assertTrue,
  assertFalse,
  assertThrows,
} from "./runner";
import { Timer } from "../src/game/Timer";

describe("Timer", () => {
  test("초기 상태: 남은 시간 = limit, 정지, 미만료", () => {
    const t = new Timer(60);
    assertEqual(t.getRemainingMs(), 60_000);
    assertFalse(t.isRunning());
    assertFalse(t.isExpired());
  });

  test("음수 limit은 에러", () => {
    assertThrows(() => new Timer(-1));
  });

  test("start 전에는 tick이 무시된다", () => {
    const t = new Timer(10);
    t.tick(5000);
    assertEqual(t.getRemainingMs(), 10_000);
  });

  test("start 후 tick은 남은 시간을 감소시킨다", () => {
    const t = new Timer(10);
    t.start();
    t.tick(3000);
    assertEqual(t.getRemainingMs(), 7000);
  });

  test("pause 중에는 tick 무시", () => {
    const t = new Timer(10);
    t.start();
    t.tick(1000);
    t.pause();
    t.tick(5000);
    assertEqual(t.getRemainingMs(), 9000);
    assertFalse(t.isRunning());
  });

  test("resume 후 tick 재개", () => {
    const t = new Timer(10);
    t.start();
    t.tick(2000);
    t.pause();
    t.resume();
    t.tick(3000);
    assertEqual(t.getRemainingMs(), 5000);
  });

  test("만료 시 onExpire 콜백 1회 호출", () => {
    const t = new Timer(1);
    let calls = 0;
    t.onExpired(() => calls++);
    t.start();
    t.tick(500);
    assertEqual(calls, 0);
    t.tick(1500);
    assertEqual(calls, 1);
    assertTrue(t.isExpired());
    // 추가 tick은 무시되며 콜백 재호출도 없다
    t.tick(1000);
    assertEqual(calls, 1);
  });

  test("만료 후 resume/start는 무시", () => {
    const t = new Timer(1);
    t.start();
    t.tick(2000);
    t.resume();
    t.start();
    assertFalse(t.isRunning());
  });

  test("reset: 상태 복원", () => {
    const t = new Timer(5);
    t.start();
    t.tick(3000);
    t.reset();
    assertEqual(t.getRemainingMs(), 5000);
    assertFalse(t.isRunning());
    assertFalse(t.isExpired());
  });

  test("getRemainingSeconds: ceil", () => {
    const t = new Timer(10);
    t.start();
    t.tick(100);
    assertEqual(t.getRemainingSeconds(), 10); // 9.9s → 10
    t.tick(900);
    assertEqual(t.getRemainingSeconds(), 9);
    t.tick(500);
    assertEqual(t.getRemainingSeconds(), 9); // 8.5s → 9
  });

  test("setElapsedMs: 경과 시간 직접 설정 (세션 복원)", () => {
    const t = new Timer(10);
    t.setElapsedMs(7000);
    assertEqual(t.getRemainingMs(), 3000);
    assertEqual(t.getLimitMs(), 10_000); // 한도는 그대로
    // 이후 start → tick 정상 진행
    t.start();
    t.tick(1000);
    assertEqual(t.getRemainingMs(), 2000);
  });

  test("setElapsedMs: 한도 이상이면 만료 처리 (콜백은 호출 안 됨)", () => {
    const t = new Timer(5);
    let calls = 0;
    t.onExpired(() => calls++);
    t.setElapsedMs(10_000);
    assertTrue(t.isExpired());
    assertFalse(t.isRunning());
    assertEqual(calls, 0); // 복원은 만료 이벤트가 아님
  });

  test("setElapsedMs: 음수/비유한 값은 에러", () => {
    const t = new Timer(5);
    assertThrows(() => t.setElapsedMs(-1));
    assertThrows(() => t.setElapsedMs(NaN));
  });

  test("음수/0 deltaMs는 무시", () => {
    const t = new Timer(5);
    t.start();
    t.tick(0);
    t.tick(-100);
    assertEqual(t.getRemainingMs(), 5000);
  });
});
