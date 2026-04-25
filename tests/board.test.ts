import {
  describe,
  test,
  assertEqual,
  assertTrue,
  assertFalse,
  assertThrows,
  assertDeepEqual,
} from "./runner";
import { Board } from "../src/game/Board";

describe("Board", () => {
  test("초기화: 유효한 2D 배열로 cols/rows 결정", () => {
    const b = new Board([
      [1, 2, 3],
      [4, 5, 6],
    ]);
    assertEqual(b.getCols(), 3);
    assertEqual(b.getRows(), 2);
  });

  test("잘못된 셀 값(>9, 음수, 소수)은 에러", () => {
    assertThrows(() => new Board([[1, 2, 10]]));
    assertThrows(() => new Board([[1, 2, -1]]));
    assertThrows(() => new Board([[1, 2, 3.5]]));
  });

  test("행별 길이 불일치는 에러", () => {
    assertThrows(
      () =>
        new Board([
          [1, 2, 3],
          [4, 5],
        ]),
    );
  });

  test("빈 보드는 에러", () => {
    assertThrows(() => new Board([]));
    assertThrows(() => new Board([[]]));
  });

  test("getCell: (col,row) 순서", () => {
    const b = new Board([
      [1, 2, 3],
      [4, 5, 6],
    ]);
    assertEqual(b.getCell(0, 0), 1);
    assertEqual(b.getCell(2, 0), 3);
    assertEqual(b.getCell(1, 1), 5);
  });

  test("inBounds", () => {
    const b = new Board([
      [1, 2, 3],
      [4, 5, 6],
    ]);
    assertTrue(b.inBounds(0, 0));
    assertTrue(b.inBounds(2, 1));
    assertFalse(b.inBounds(3, 0));
    assertFalse(b.inBounds(0, 2));
    assertFalse(b.inBounds(-1, 0));
  });

  test("isEmpty: 0 값 감지", () => {
    const b = new Board([[1, 0, 3]]);
    assertTrue(b.isEmpty(1, 0));
    assertFalse(b.isEmpty(0, 0));
  });

  test("clearCell / clearCells", () => {
    const b = new Board([
      [1, 2, 3],
      [4, 5, 6],
    ]);
    b.clearCell(1, 0);
    assertTrue(b.isEmpty(1, 0));
    b.clearCells([
      [0, 1],
      [2, 1],
    ]);
    assertTrue(b.isEmpty(0, 1));
    assertTrue(b.isEmpty(2, 1));
    assertFalse(b.isEmpty(1, 1));
  });

  test("isCleared", () => {
    const b = new Board([[1, 2]]);
    assertFalse(b.isCleared());
    b.clearCells([
      [0, 0],
      [1, 0],
    ]);
    assertTrue(b.isCleared());
  });

  test("isCleared: 초기가 전부 0", () => {
    const b = new Board([
      [0, 0],
      [0, 0],
    ]);
    assertTrue(b.isCleared());
  });

  test("sumAt", () => {
    const b = new Board([
      [1, 2, 3],
      [4, 5, 6],
    ]);
    assertEqual(
      b.sumAt([
        [0, 0],
        [1, 0],
        [2, 0],
      ]),
      6,
    );
    assertEqual(b.sumAt([[2, 1]]), 6);
  });

  test("snapshot: 복사본 반환으로 원본 보호", () => {
    const b = new Board([
      [1, 2],
      [3, 4],
    ]);
    const snap = b.snapshot();
    snap[0][0] = 99;
    assertEqual(b.getCell(0, 0), 1);
  });

  test("경계 밖 접근은 RangeError", () => {
    const b = new Board([[1, 2]]);
    assertThrows(() => b.getCell(5, 5));
    assertThrows(() => b.clearCell(-1, 0));
  });

  test("remainingCount", () => {
    const b = new Board([
      [1, 2, 0],
      [0, 3, 4],
    ]);
    assertEqual(b.remainingCount(), 4);
    b.clearCell(0, 0);
    assertEqual(b.remainingCount(), 3);
  });

  test("applyGravity: 각 열의 빈 칸이 위로, 값은 아래로 이동", () => {
    const b = new Board([
      [1, 2, 0],
      [0, 3, 4],
      [5, 0, 6],
    ]);
    const moved = b.applyGravity();
    assertTrue(moved);
    assertDeepEqual(b.snapshot(), [
      [0, 0, 0],
      [1, 2, 4],
      [5, 3, 6],
    ]);
  });

  test("applyGravity: 이미 바닥 정렬이면 moved=false, 값 변화 없음", () => {
    const b = new Board([
      [0, 0],
      [1, 2],
      [3, 4],
    ]);
    const moved = b.applyGravity();
    assertFalse(moved);
    assertDeepEqual(b.snapshot(), [
      [0, 0],
      [1, 2],
      [3, 4],
    ]);
  });

  test("applyGravity: 전체 빈 열/전체 꽉찬 열 혼합", () => {
    const b = new Board([
      [1, 0],
      [2, 0],
      [3, 0],
    ]);
    b.applyGravity();
    assertDeepEqual(b.snapshot(), [
      [1, 0],
      [2, 0],
      [3, 0],
    ]);
  });

  test("applyGravity: 단일 열 중간 빈 칸", () => {
    const b = new Board([[1], [0], [3]]);
    b.applyGravity();
    assertDeepEqual(b.snapshot(), [[0], [1], [3]]);
  });

  test("refill: 빈 칸을 1~9로 채우고 반환값은 채워진 개수", () => {
    const b = new Board([
      [1, 0, 3],
      [0, 0, 6],
    ]);
    const filled = b.refill(() => 0);
    assertEqual(filled, 3);
    const snap = b.snapshot();
    // 0이 없어야 하며 모든 값은 1~9
    for (const row of snap) {
      for (const v of row) {
        assertTrue(v >= 1 && v <= 9);
      }
    }
    // 기존 non-empty 값은 보존
    assertEqual(snap[0][0], 1);
    assertEqual(snap[0][2], 3);
    assertEqual(snap[1][2], 6);
  });

  test("refill: 주입된 RNG가 0 → 모든 빈 칸이 1", () => {
    const b = new Board([
      [1, 0],
      [0, 2],
    ]);
    b.refill(() => 0);
    const snap = b.snapshot();
    assertEqual(snap[0][1], 1);
    assertEqual(snap[1][0], 1);
  });

  test("refill: 빈 칸이 없으면 0 반환, 값 불변", () => {
    const b = new Board([
      [1, 2],
      [3, 4],
    ]);
    const filled = b.refill(() => 0.5);
    assertEqual(filled, 0);
    assertDeepEqual(b.snapshot(), [
      [1, 2],
      [3, 4],
    ]);
  });

  test("nonEmptyCells 순회 — value + lives 포함", () => {
    const b = new Board([
      [1, 0],
      [0, 2],
    ]);
    const cells = Array.from(b.nonEmptyCells());
    assertDeepEqual(cells, [
      { col: 0, row: 0, value: 1, lives: 1 },
      { col: 1, row: 1, value: 2, lives: 1 },
    ]);
  });

  // ---------- 멀티라이프(lives ≥ 2) ----------

  test("initialLives 미지정: 모든 비빈칸 lives=1, 빈칸 lives=0", () => {
    const b = new Board([
      [1, 0],
      [3, 7],
    ]);
    assertEqual(b.getLives(0, 0), 1);
    assertEqual(b.getLives(1, 0), 0);
    assertEqual(b.getLives(0, 1), 1);
    assertEqual(b.getLives(1, 1), 1);
  });

  test("initialLives 지정 — lives 그대로 보존", () => {
    const b = new Board(
      [
        [3, 7],
        [4, 6],
      ],
      [
        [3, 1],
        [1, 2],
      ],
    );
    assertEqual(b.getLives(0, 0), 3);
    assertEqual(b.getLives(1, 0), 1);
    assertEqual(b.getLives(0, 1), 1);
    assertEqual(b.getLives(1, 1), 2);
    assertDeepEqual(b.livesSnapshot(), [
      [3, 1],
      [1, 2],
    ]);
  });

  test("initialLives: 차원 불일치/범위 위반/빈칸-lives 정합성 에러", () => {
    // 행 수 불일치
    assertThrows(() => new Board([[1, 2]], [[1]]));
    // 열 수 불일치
    assertThrows(() => new Board([[1, 2]], [[1]]));
    // lives > 5
    assertThrows(() => new Board([[1]], [[6]]));
    // 음수
    assertThrows(() => new Board([[1]], [[-1]]));
    // 비빈칸인데 lives=0
    assertThrows(() => new Board([[3]], [[0]]));
    // 빈칸인데 lives>0
    assertThrows(() => new Board([[0]], [[1]]));
  });

  test("applyMatch: 2셀 일반(lives=1) — 둘 다 즉시 제거", () => {
    const b = new Board([[3, 7]]);
    const destroyed = b.applyMatch([
      [0, 0],
      [1, 0],
    ]);
    assertEqual(destroyed, 2);
    assertTrue(b.isEmpty(0, 0));
    assertTrue(b.isEmpty(1, 0));
  });

  test("applyMatch: 2셀 한쪽만 멀티(lives=3) — 일반은 제거, 멀티는 lives -1", () => {
    const b = new Board(
      [[3, 7]],
      [[3, 1]], // 좌:lives=3, 우:lives=1
    );
    const destroyed = b.applyMatch([
      [0, 0],
      [1, 0],
    ]);
    assertEqual(destroyed, 1);
    assertEqual(b.getCell(0, 0), 3);
    assertEqual(b.getLives(0, 0), 2); // 3 - 1 = 2
    assertTrue(b.isEmpty(1, 0));
  });

  test("applyMatch: 2셀 양쪽 멀티 — min(lives) 만큼 양쪽 차감, 작은 쪽 제거", () => {
    const b = new Board(
      [[4, 6]],
      [[5, 2]],
    );
    const destroyed = b.applyMatch([
      [0, 0],
      [1, 0],
    ]);
    assertEqual(destroyed, 1);
    // 4(lives=5) - 2 = 3 살아있음
    assertEqual(b.getLives(0, 0), 3);
    assertEqual(b.getCell(0, 0), 4);
    // 6(lives=2) - 2 = 0 제거
    assertTrue(b.isEmpty(1, 0));
  });

  test("applyMatch: 2셀 양쪽 멀티 동등 lives — 둘 다 제거", () => {
    const b = new Board(
      [[3, 7]],
      [[3, 3]],
    );
    const destroyed = b.applyMatch([
      [0, 0],
      [1, 0],
    ]);
    assertEqual(destroyed, 2);
    assertTrue(b.isEmpty(0, 0));
    assertTrue(b.isEmpty(1, 0));
  });

  test("applyMatch: 3셀 매치 — 항상 셀당 1 데미지 (특수 규칙 미적용)", () => {
    const b = new Board(
      [[2, 3, 5]],
      [[3, 3, 3]], // 셋 다 멀티
    );
    const destroyed = b.applyMatch([
      [0, 0],
      [1, 0],
      [2, 0],
    ]);
    assertEqual(destroyed, 0); // 모두 lives 3→2 살아있음
    assertEqual(b.getLives(0, 0), 2);
    assertEqual(b.getLives(1, 0), 2);
    assertEqual(b.getLives(2, 0), 2);
  });

  test("applyGravity: 멀티라이프 셀의 lives도 함께 낙하", () => {
    const b = new Board(
      [
        [3, 7],
        [0, 6],
        [0, 0],
      ],
      [
        [4, 1],
        [0, 3],
        [0, 0],
      ],
    );
    b.applyGravity();
    // 좌측 열: lives=4의 3이 맨 아래로
    assertEqual(b.getCell(0, 2), 3);
    assertEqual(b.getLives(0, 2), 4);
    // 우측 열: 7(lives=1) → 6(lives=3) 순으로 아래쪽
    assertEqual(b.getCell(1, 1), 7);
    assertEqual(b.getLives(1, 1), 1);
    assertEqual(b.getCell(1, 2), 6);
    assertEqual(b.getLives(1, 2), 3);
  });

  test("applyMatch: 빈 positions 배열 → 0 반환, 보드 불변", () => {
    const b = new Board([[3, 7]], [[2, 3]]);
    const before = JSON.stringify({ g: b.snapshot(), l: b.livesSnapshot() });
    assertEqual(b.applyMatch([]), 0);
    const after = JSON.stringify({ g: b.snapshot(), l: b.livesSnapshot() });
    assertEqual(before, after);
  });

  test("applyMatch: 경계 밖 좌표 무시 (throw 안 함)", () => {
    const b = new Board([[3, 7]], [[2, 2]]);
    // 한쪽이 경계 밖이면 특수 규칙 미적용, 정상 셀만 1 데미지
    const destroyed = b.applyMatch([
      [0, 0],
      [9, 9],
    ]);
    assertEqual(destroyed, 0);
    assertEqual(b.getLives(0, 0), 1); // 2 → 1
    // 또 다른 케이스: 양쪽 다 경계 밖
    assertEqual(
      b.applyMatch([
        [-1, 0],
        [9, 9],
      ]),
      0,
    );
  });

  test("applyMatch: 빈 셀(lives=0) 좌표는 데미지 없음", () => {
    const b = new Board([
      [3, 0],
      [4, 7],
    ]);
    // (1,0)은 빈 칸 — applyDamageAt에서 lives<=0 로 0 반환
    const destroyed = b.applyMatch([
      [0, 0],
      [1, 0],
    ]);
    assertEqual(destroyed, 1);
    assertTrue(b.isEmpty(0, 0));
  });

  test("applyMatch 라이프사이클: lives=4 셀이 4회 매치 후 제거", () => {
    const b = new Board(
      [[3, 7]],
      [[4, 1]],
    );
    // 1번째: 좌(4)→3, 우(1)→0 제거
    let d = b.applyMatch([
      [0, 0],
      [1, 0],
    ]);
    assertEqual(d, 1);
    assertEqual(b.getLives(0, 0), 3);
    // 우측 다시 채움 (테스트용 직접 setup)
    (b as unknown as { grid: number[][]; lives: number[][] }).grid[0][1] = 7;
    (b as unknown as { grid: number[][]; lives: number[][] }).lives[0][1] = 1;
    // 2번째 매치
    d = b.applyMatch([
      [0, 0],
      [1, 0],
    ]);
    assertEqual(b.getLives(0, 0), 2);
    (b as unknown as { grid: number[][]; lives: number[][] }).grid[0][1] = 7;
    (b as unknown as { grid: number[][]; lives: number[][] }).lives[0][1] = 1;
    // 3번째 매치
    d = b.applyMatch([
      [0, 0],
      [1, 0],
    ]);
    assertEqual(b.getLives(0, 0), 1);
    (b as unknown as { grid: number[][]; lives: number[][] }).grid[0][1] = 7;
    (b as unknown as { grid: number[][]; lives: number[][] }).lives[0][1] = 1;
    // 4번째 매치 — 좌(1)→0 제거, 우(1)→0 제거
    d = b.applyMatch([
      [0, 0],
      [1, 0],
    ]);
    assertEqual(d, 2);
    assertTrue(b.isEmpty(0, 0));
    assertTrue(b.isEmpty(1, 0));
  });

  test("applyMatch: 멀티가 lives=1로 떨어진 후 다음 매치에서 일반처럼 즉시 제거", () => {
    const b = new Board([[3, 7]], [[2, 1]]);
    // 1번째: 좌(2,멀티)+우(1,일반) → 한쪽만 멀티이므로 셀당 1 데미지
    b.applyMatch([
      [0, 0],
      [1, 0],
    ]);
    assertEqual(b.getLives(0, 0), 1); // 멀티가 일반화
    // 우측 다시 일반 셀로 셋업
    (b as unknown as { grid: number[][]; lives: number[][] }).grid[0][1] = 7;
    (b as unknown as { grid: number[][]; lives: number[][] }).lives[0][1] = 1;
    // 2번째 매치 — 양쪽 일반이므로 즉시 제거
    const d = b.applyMatch([
      [0, 0],
      [1, 0],
    ]);
    assertEqual(d, 2);
    assertTrue(b.isEmpty(0, 0));
  });

  test("applyMatch + applyGravity + refill: 살아남은 멀티는 자리 유지, 제거된 셀만 낙하/리필", () => {
    // 2x2: 위 [3@2lives, 7@1life], 아래 [4@1life, 6@1life]
    const b = new Board(
      [
        [3, 7],
        [4, 6],
      ],
      [
        [2, 1],
        [1, 1],
      ],
    );
    // 위쪽 행 매치 → 좌(2,멀티)+우(1,일반) 분기 → 둘 다 1 데미지
    // 좌측은 멀티 → lives=1, 우측은 일반 → 제거
    b.applyMatch([
      [0, 0],
      [1, 0],
    ]);
    assertEqual(b.getLives(0, 0), 1);
    assertTrue(b.isEmpty(1, 0));
    // 중력: (1,0) 빈칸으로 (1,1)의 6이 위로 못 올라가지만 같은 열의 6이 위로 올라옴(중력은 아래로 떨어뜨림)
    // 실제로 우측 열은 [0, 6] → [0, 6] (이미 아래로 모여있음)
    b.applyGravity();
    assertEqual(b.getCell(1, 1), 6);
    assertTrue(b.isEmpty(1, 0));
    assertEqual(b.getCell(0, 0), 3); // 좌측 멀티는 그대로 (lives=1)
    assertEqual(b.getCell(0, 1), 4);
    // 리필 — RNG=0 → 새 셀은 1, lives=1
    b.refill(() => 0);
    assertEqual(b.getCell(1, 0), 1);
    assertEqual(b.getLives(1, 0), 1);
  });

  test("refill: 새로 채워지는 셀은 항상 lives=1", () => {
    const b = new Board(
      [
        [3, 0],
        [0, 7],
      ],
      [
        [4, 0],
        [0, 1],
      ],
    );
    b.refill(() => 0.5);
    assertEqual(b.getLives(0, 0), 4); // 기존 멀티 보존
    assertEqual(b.getLives(1, 0), 1); // 새 셀
    assertEqual(b.getLives(0, 1), 1); // 새 셀
    assertEqual(b.getLives(1, 1), 1);
  });
});
