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

  test("nonEmptyCells 순회 — value + lives + wild + bonus 포함", () => {
    const b = new Board([
      [1, 0],
      [0, 2],
    ]);
    const cells = Array.from(b.nonEmptyCells());
    assertDeepEqual(cells, [
      { col: 0, row: 0, value: 1, lives: 1, wild: false, bonus: false },
      { col: 1, row: 1, value: 2, lives: 1, wild: false, bonus: false },
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

  test("obstacles: 생성자 — 장애물 칸은 grid=0, lives=0, isObstacle=true", () => {
    const b = new Board(
      [
        [1, 0],
        [2, 3],
      ],
      undefined,
      [
        [0, 1],
        [0, 0],
      ],
    );
    assertTrue(b.isObstacle(1, 0));
    assertFalse(b.isObstacle(0, 0));
    assertEqual(b.getCell(1, 0), 0);
    assertEqual(b.getLives(1, 0), 0);
  });

  test("obstacles: grid≠0 자리에 장애물 지정은 에러", () => {
    assertThrows(
      () =>
        new Board(
          [[1, 2]],
          undefined,
          [[1, 0]], // (0,0)=1인데 장애물 지정 → 에러
        ),
    );
  });

  test("obstacles: 차원 불일치는 에러", () => {
    assertThrows(
      () =>
        new Board(
          [[1, 2, 3]],
          undefined,
          [[0, 0]], // 행은 1이지만 열이 2 (3이어야)
        ),
    );
  });

  test("applyGravity: 장애물 통과 — 위 블럭이 장애물 아래 빈칸에 쌓인다", () => {
    // 한 열만으로 시뮬레이션. 장애물은 (0,2). 그 아래 7이 비워졌다고 가정.
    const b = new Board(
      [[5], [3], [0], [0], [9]],
      undefined,
      [[0], [0], [1], [0], [0]],
    );
    b.applyGravity();
    // 슬롯 = (0,1,3,4) — 4칸. 블럭 = 5,3,9 (3개). 빈 = 1.
    // 배치: 상단 1슬롯 비움(row 0), 하단 3슬롯에 5,3,9 순으로.
    // 결과: row0=0, row1=5, row2=장애물, row3=3, row4=9
    assertEqual(b.getCell(0, 0), 0);
    assertEqual(b.getCell(0, 1), 5);
    assertTrue(b.isObstacle(0, 2));
    assertEqual(b.getCell(0, 2), 0);
    assertEqual(b.getCell(0, 3), 3);
    assertEqual(b.getCell(0, 4), 9);
  });

  test("applyGravity: 장애물 위치 자체는 변하지 않는다", () => {
    const b = new Board(
      [[1, 0], [0, 5]],
      undefined,
      [[0, 1], [1, 0]],
    );
    b.applyGravity();
    assertTrue(b.isObstacle(1, 0));
    assertTrue(b.isObstacle(0, 1));
  });

  test("refill: 장애물 셀은 절대 채우지 않음", () => {
    const b = new Board(
      [
        [0, 0],
        [0, 0],
      ],
      undefined,
      [
        [1, 0],
        [0, 0],
      ],
    );
    const filled = b.refill(() => 0);
    assertEqual(filled, 3);
    assertTrue(b.isObstacle(0, 0));
    assertEqual(b.getCell(0, 0), 0);
    assertEqual(b.getCell(1, 0), 1);
  });

  test("applyGravity: 멀티라이프 셀이 장애물 통과 시 lives 보존", () => {
    // 0=3(life=3), 1=빈, 2=장애물, 3=빈, 4=빈
    const b = new Board(
      [[3], [0], [0], [0], [0]],
      [[3], [0], [0], [0], [0]],
      [[0], [0], [1], [0], [0]],
    );
    b.applyGravity();
    // 슬롯 = (0,1,3,4). 블럭 = [3]. emptyCount=3. 마지막 슬롯(row 4)에 배치.
    assertEqual(b.getCell(0, 4), 3);
    assertEqual(b.getLives(0, 4), 3); // lives 보존
    assertEqual(b.getCell(0, 0), 0);
    assertEqual(b.getCell(0, 1), 0);
    assertTrue(b.isObstacle(0, 2));
    assertEqual(b.getCell(0, 3), 0);
  });

  test("applyGravity: 한 열에 장애물 2개 — 위 블럭이 두 장애물 모두 통과해 바닥에 쌓임", () => {
    // row: 0=5, 1=장애물, 2=빈, 3=장애물, 4=8 (이 8이 매치로 사라졌다고 가정 → 실제로는 5만 있음)
    const b = new Board(
      [[5], [0], [0], [0], [0]],
      undefined,
      [[0], [1], [0], [1], [0]],
    );
    b.applyGravity();
    // 슬롯 = (0,2,4). 블럭=[5]. emptyCount=2. 마지막 슬롯(row 4)에 5 배치.
    assertEqual(b.getCell(0, 0), 0);
    assertTrue(b.isObstacle(0, 1));
    assertEqual(b.getCell(0, 2), 0);
    assertTrue(b.isObstacle(0, 3));
    assertEqual(b.getCell(0, 4), 5);
  });

  test("applyGravity: 전체 장애물인 열은 변화 없음", () => {
    const b = new Board(
      [[1, 0], [2, 0], [3, 0]],
      undefined,
      [[0, 1], [0, 1], [0, 1]],
    );
    b.applyGravity();
    // 1열은 모두 장애물 — 슬롯 0개 → 처리 없음.
    assertTrue(b.isObstacle(1, 0));
    assertTrue(b.isObstacle(1, 1));
    assertTrue(b.isObstacle(1, 2));
    // 0열은 정상 (이미 가득 차 있음).
    assertEqual(b.getCell(0, 0), 1);
    assertEqual(b.getCell(0, 1), 2);
    assertEqual(b.getCell(0, 2), 3);
  });

  test("applyMatch + applyGravity + refill: 장애물 아래 블럭 제거 → 위 블럭이 빈자리 차지", () => {
    // (0,0)=4, (0,1)=장, (0,2)=6 (지금 매치로 (0,2)와 (1,2)=4 제거 가정)
    // 결과: (0,0)→떨어져 (0,2) 자리 채움.
    const b = new Board(
      [
        [4, 0],
        [0, 0], // (0,1) 장애물
        [6, 4],
      ],
      undefined,
      [
        [0, 0],
        [1, 0],
        [0, 0],
      ],
    );
    // (0,2)와 (1,2)를 매치(6+4=10)로 제거.
    b.applyMatch([
      [0, 2],
      [1, 2],
    ]);
    b.applyGravity();
    // 0열: 슬롯=(0,2). 블럭=[4]. emptyCount=1 → row 0 비움, row 2에 4.
    assertEqual(b.getCell(0, 0), 0);
    assertTrue(b.isObstacle(0, 1));
    assertEqual(b.getCell(0, 2), 4);
    b.refill(() => 0); // 임의값=1
    assertEqual(b.getCell(0, 0), 1); // 새로 채워짐
    assertTrue(b.isObstacle(0, 1)); // 장애물 그대로
    assertEqual(b.getCell(0, 2), 4); // 보존
  });

  test("obstaclesSnapshot: 동일 차원의 boolean 사본 반환", () => {
    const b = new Board([[1, 0]], undefined, [[0, 1]]);
    const snap = b.obstaclesSnapshot();
    assertEqual(snap.length, 1);
    assertEqual(snap[0].length, 2);
    assertEqual(snap[0][0], false);
    assertEqual(snap[0][1], true);
    snap[0][0] = true; // 사본 변경이 원본에 반영되지 않음
    assertFalse(b.isObstacle(0, 0));
  });

  // ---------- 만능(?) 블럭 ----------

  test("wildcard: 생성자에 initialWildcards 전달하면 isWildcard=true, isEmpty=false", () => {
    const b = new Board(
      [[0, 1]],
      undefined,
      undefined,
      [[1, 0]],
    );
    assertTrue(b.isWildcard(0, 0));
    assertFalse(b.isEmpty(0, 0)); // 만능은 빈칸이 아님 (선택 가능)
    assertEqual(b.getCell(0, 0), 0); // grid는 0(숫자 아님)
    assertEqual(b.getLives(0, 0), 1); // 자동 1로 보정
  });

  test("wildcard: 빈칸이 아닌 자리에 만능 지정하면 에러", () => {
    assertThrows(
      () => new Board([[3, 7]], undefined, undefined, [[1, 0]]),
    );
  });

  test("wildcard + obstacle 동일 위치는 에러", () => {
    assertThrows(
      () =>
        new Board(
          [[0, 1]],
          undefined,
          [[1, 0]],
          [[1, 0]],
        ),
    );
  });

  test("convertToWildcard: 일반 셀 → 만능, lives=1로 리셋", () => {
    const b = new Board([[5]], [[3]]);
    assertTrue(b.convertToWildcard(0, 0));
    assertTrue(b.isWildcard(0, 0));
    assertEqual(b.getCell(0, 0), 0);
    assertEqual(b.getLives(0, 0), 1); // 멀티라이프(3)였어도 1로 리셋
  });

  test("convertToWildcard: 빈칸/장애물/이미 만능인 자리는 false", () => {
    const b = new Board(
      [
        [3, 0, 0, 0],
      ],
      undefined,
      [[0, 0, 1, 0]],
      [[0, 0, 0, 1]],
    );
    assertTrue(b.convertToWildcard(0, 0)); // 일반 셀 OK
    assertFalse(b.convertToWildcard(0, 0)); // 이제 이미 만능
    assertFalse(b.convertToWildcard(1, 0)); // 빈칸
    assertFalse(b.convertToWildcard(2, 0)); // 장애물
    assertFalse(b.convertToWildcard(3, 0)); // 이미 만능
  });

  test("applyMatch: 만능 셀이 destroy 되면 wild 플래그도 false 로 정리", () => {
    const b = new Board([[0, 7]], undefined, undefined, [[1, 0]]);
    b.applyMatch([
      [0, 0],
      [1, 0],
    ]);
    assertFalse(b.isWildcard(0, 0));
    assertEqual(b.getCell(0, 0), 0);
    assertEqual(b.getLives(0, 0), 0);
  });

  test("applyGravity: 만능 셀도 일반 블럭처럼 함께 낙하 (wild 플래그 보존)", () => {
    // 0열: row0=만능, row1=빈칸 → 만능이 row1로 떨어져야 함
    const b = new Board([[0], [0]], undefined, undefined, [[1], [0]]);
    b.applyGravity();
    assertFalse(b.isWildcard(0, 0));
    assertTrue(b.isWildcard(0, 1));
  });

  test("refill: 만능 셀은 보존(refill 대상 아님)", () => {
    const b = new Board(
      [[0, 0]],
      undefined,
      undefined,
      [[1, 0]],
    );
    const filled = b.refill(() => 0);
    assertEqual(filled, 1); // (1,0) 빈칸만 채워짐
    assertTrue(b.isWildcard(0, 0));
    assertEqual(b.getCell(0, 0), 0); // 만능은 grid=0 유지
    assertEqual(b.getCell(1, 0), 1);
  });

  test("wildcardsSnapshot: 동일 차원 boolean 사본", () => {
    const b = new Board([[3, 0]], undefined, undefined, [[0, 1]]);
    const snap = b.wildcardsSnapshot();
    assertEqual(snap[0][0], false);
    assertEqual(snap[0][1], true);
    snap[0][0] = true;
    assertFalse(b.isWildcard(0, 0));
  });

  // ---------- 보너스(×2) 블럭 ----------

  test("bonus: 초기 상태는 모두 false", () => {
    const b = new Board([[3, 7]]);
    assertFalse(b.isBonus(0, 0));
    assertFalse(b.isBonus(1, 0));
  });

  test("markBonus: 일반 숫자 셀에서 성공, 같은 셀 재마킹은 false", () => {
    const b = new Board([[3]]);
    assertTrue(b.markBonus(0, 0));
    assertTrue(b.isBonus(0, 0));
    assertFalse(b.markBonus(0, 0)); // 이미 보너스
  });

  test("markBonus: 빈칸/장애물/만능에서는 실패", () => {
    const b = new Board(
      [[0, 0, 0]],
      undefined,
      [[0, 1, 0]], // 1: 장애물
      [[0, 0, 1]], // 2: 만능
    );
    assertFalse(b.markBonus(0, 0)); // 빈칸
    assertFalse(b.markBonus(1, 0)); // 장애물
    assertFalse(b.markBonus(2, 0)); // 만능
  });

  test("unmarkBonus: 플래그만 제거, 셀 자체는 유지", () => {
    const b = new Board([[5]]);
    b.markBonus(0, 0);
    b.unmarkBonus(0, 0);
    assertFalse(b.isBonus(0, 0));
    assertEqual(b.getCell(0, 0), 5); // grid 보존
  });

  test("applyMatch: 보너스 셀 파괴 시 bonus 플래그도 false 로 정리", () => {
    const b = new Board([[3, 7]]);
    b.markBonus(0, 0);
    b.applyMatch([
      [0, 0],
      [1, 0],
    ]);
    assertFalse(b.isBonus(0, 0));
    assertEqual(b.getCell(0, 0), 0); // 파괴됨
  });

  test("applyGravity: 보너스 셀이 떨어지면서 bonus 플래그 보존", () => {
    // 1열 2행: row0=5(보너스), row1=빈칸 → row1 로 떨어져야 함
    const b = new Board([[5], [0]]);
    b.markBonus(0, 0);
    // (0,1)을 비우려고 직접 clearCell — 사실 row1은 이미 0
    b.applyGravity();
    assertFalse(b.isBonus(0, 0));
    assertTrue(b.isBonus(0, 1));
    assertEqual(b.getCell(0, 1), 5);
  });

  test("bonusSnapshot: 동일 차원의 boolean 사본", () => {
    const b = new Board([[1, 2]]);
    b.markBonus(1, 0);
    const snap = b.bonusSnapshot();
    assertEqual(snap[0][0], false);
    assertEqual(snap[0][1], true);
    snap[0][0] = true;
    assertFalse(b.isBonus(0, 0)); // 원본 비변경
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
