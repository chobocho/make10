import {
  describe,
  test,
  assertEqual,
  assertTrue,
  assertFalse,
  assertDeepEqual,
} from "./runner";
import {
  MemoryProgressStore,
  MemoryMetaStore,
  SaveManager,
  ProgressStore,
  ProgressRecord,
} from "../src/storage/SaveManager";

function sample(mapId: number, score: number): ProgressRecord {
  return {
    mapId,
    boardState: [
      [1, 2, 3],
      [4, 5, 6],
    ],
    score,
    timeLeft: 60,
    timestamp: 1_700_000_000_000,
  };
}

describe("SaveManager (메모리 스토어 사용)", () => {
  test("isAvailable: 스토어 주입 여부에 따라", () => {
    assertTrue(new SaveManager(new MemoryProgressStore()).isAvailable());
    assertFalse(new SaveManager(null).isAvailable());
  });

  test("save → load 왕복", async () => {
    const sm = new SaveManager(new MemoryProgressStore());
    assertTrue(await sm.save(sample(1, 500)));
    const r = await sm.load(1);
    assertEqual(r?.score, 500);
  });

  test("load 없는 키는 null", async () => {
    const sm = new SaveManager(new MemoryProgressStore());
    assertEqual(await sm.load(99), null);
  });

  test("delete 후 load는 null", async () => {
    const sm = new SaveManager(new MemoryProgressStore());
    await sm.save(sample(2, 100));
    assertTrue(await sm.delete(2));
    assertEqual(await sm.load(2), null);
  });

  test("list: 정렬된 전체", async () => {
    const sm = new SaveManager(new MemoryProgressStore());
    await sm.save(sample(3, 10));
    await sm.save(sample(1, 20));
    await sm.save(sample(2, 30));
    const list = await sm.list();
    assertDeepEqual(
      list.map((r) => r.mapId),
      [1, 2, 3],
    );
  });

  test("스토어 미가용 시 save/load/list 모두 폴백 값", async () => {
    const sm = new SaveManager(null);
    assertFalse(await sm.save(sample(1, 0)));
    assertEqual(await sm.load(1), null);
    assertEqual((await sm.list()).length, 0);
    assertFalse(await sm.delete(1));
  });

  test("saveBest: 처음 저장은 성공", async () => {
    const sm = new SaveManager(new MemoryProgressStore());
    assertTrue(await sm.saveBest(sample(1, 300)));
    assertEqual((await sm.load(1))?.score, 300);
  });

  test("saveBest: 기존보다 낮은 점수는 덮어쓰지 않음", async () => {
    const sm = new SaveManager(new MemoryProgressStore());
    await sm.saveBest(sample(1, 500));
    assertFalse(await sm.saveBest(sample(1, 300)));
    assertEqual((await sm.load(1))?.score, 500);
  });

  test("saveBest: 동점은 업데이트하지 않음", async () => {
    const sm = new SaveManager(new MemoryProgressStore());
    await sm.saveBest(sample(1, 500));
    assertFalse(await sm.saveBest(sample(1, 500)));
  });

  test("saveBest: 높은 점수는 덮어씀", async () => {
    const sm = new SaveManager(new MemoryProgressStore());
    await sm.saveBest(sample(1, 300));
    assertTrue(await sm.saveBest(sample(1, 700)));
    assertEqual((await sm.load(1))?.score, 700);
  });

  test("세션: saveSession → loadSession 왕복", async () => {
    const sm = new SaveManager(new MemoryProgressStore(), new MemoryProgressStore());
    const rec: ProgressRecord = {
      mapId: 5,
      boardState: [[1, 9]],
      score: 250,
      stars: 1,
      timeLeft: 42,
      hintsLeft: 2,
      timestamp: 1_700_000_001_000,
    };
    assertTrue(await sm.saveSession(rec));
    const loaded = await sm.loadSession(5);
    assertEqual(loaded?.score, 250);
    assertEqual(loaded?.hintsLeft, 2);
    assertEqual(loaded?.timeLeft, 42);
  });

  test("세션: progress 스토어와 격리됨 (saveSession이 best 점수를 덮지 않음)", async () => {
    const progress = new MemoryProgressStore();
    const session = new MemoryProgressStore();
    const sm = new SaveManager(progress, session);
    await sm.saveBest(sample(7, 999));
    await sm.saveSession({ ...sample(7, 100), hintsLeft: 1 });
    assertEqual((await sm.load(7))?.score, 999, "progress(best) 그대로");
    assertEqual((await sm.loadSession(7))?.score, 100, "session 별도 저장");
  });

  test("세션: clearSession 후 loadSession 은 null", async () => {
    const sm = new SaveManager(new MemoryProgressStore(), new MemoryProgressStore());
    await sm.saveSession({ ...sample(3, 50), hintsLeft: 0 });
    assertTrue(await sm.clearSession(3));
    assertEqual(await sm.loadSession(3), null);
  });

  test("세션: listSessions 는 timestamp 내림차순(최신 우선)", async () => {
    const sm = new SaveManager(new MemoryProgressStore(), new MemoryProgressStore());
    await sm.saveSession({ ...sample(1, 10), timestamp: 100, hintsLeft: 0 });
    await sm.saveSession({ ...sample(2, 20), timestamp: 300, hintsLeft: 0 });
    await sm.saveSession({ ...sample(3, 30), timestamp: 200, hintsLeft: 0 });
    const list = await sm.listSessions();
    assertDeepEqual(
      list.map((r) => r.mapId),
      [2, 3, 1],
    );
  });

  test("세션: boardLives 왕복 정합성", async () => {
    const sm = new SaveManager(new MemoryProgressStore(), new MemoryProgressStore());
    const rec: ProgressRecord = {
      mapId: 12,
      boardState: [
        [3, 7],
        [4, 6],
      ],
      boardLives: [
        [4, 1],
        [1, 3],
      ],
      score: 200,
      stars: 1,
      timeLeft: 25,
      hintsLeft: 2,
      timestamp: 1_700_000_999_000,
    };
    await sm.saveSession(rec);
    const loaded = await sm.loadSession(12);
    assertTrue(loaded !== null);
    assertDeepEqual(loaded!.boardLives, [
      [4, 1],
      [1, 3],
    ]);
  });

  test("세션: sessionStore 미주입 시 모두 폴백", async () => {
    const sm = new SaveManager(new MemoryProgressStore()); // session=null
    assertFalse(await sm.saveSession({ ...sample(1, 0), hintsLeft: 0 }));
    assertEqual(await sm.loadSession(1), null);
    assertFalse(await sm.clearSession(1));
    assertDeepEqual(await sm.listSessions(), []);
  });

  test("메타: 튜토리얼 미완료 상태가 기본값", async () => {
    const sm = new SaveManager(
      new MemoryProgressStore(),
      new MemoryProgressStore(),
      new MemoryMetaStore(),
    );
    assertFalse(await sm.isTutorialDone());
  });

  test("메타: markTutorialDone 후 isTutorialDone=true", async () => {
    const sm = new SaveManager(
      new MemoryProgressStore(),
      new MemoryProgressStore(),
      new MemoryMetaStore(),
    );
    assertTrue(await sm.markTutorialDone());
    assertTrue(await sm.isTutorialDone());
  });

  test("메타: resetTutorial 후 다시 미완료", async () => {
    const sm = new SaveManager(
      new MemoryProgressStore(),
      new MemoryProgressStore(),
      new MemoryMetaStore(),
    );
    await sm.markTutorialDone();
    await sm.resetTutorial();
    assertFalse(await sm.isTutorialDone());
  });

  test("메타: metaStore 미주입 시 모두 false 폴백", async () => {
    const sm = new SaveManager(new MemoryProgressStore()); // meta=null
    assertFalse(await sm.markTutorialDone());
    assertFalse(await sm.isTutorialDone());
    assertFalse(await sm.resetTutorial());
  });

  test("hint carryover: 초기 0, addHintCarryover 호출마다 +1", async () => {
    const sm = new SaveManager(
      new MemoryProgressStore(),
      new MemoryProgressStore(),
      new MemoryMetaStore(),
    );
    assertEqual(await sm.peekHintCarryover(), 0);
    assertEqual(await sm.addHintCarryover(), 1);
    assertEqual(await sm.addHintCarryover(), 2);
    assertEqual(await sm.peekHintCarryover(), 2);
  });

  test("hint carryover: consume 하면 현재값 반환 + 0으로 리셋", async () => {
    const sm = new SaveManager(
      new MemoryProgressStore(),
      new MemoryProgressStore(),
      new MemoryMetaStore(),
    );
    await sm.addHintCarryover();
    await sm.addHintCarryover();
    assertEqual(await sm.consumeHintCarryover(), 2);
    assertEqual(await sm.peekHintCarryover(), 0);
    assertEqual(await sm.consumeHintCarryover(), 0); // 이미 0이면 0
  });

  test("hint carryover: metaStore 미주입 시 0 폴백 (게임 계속)", async () => {
    const sm = new SaveManager(new MemoryProgressStore());
    assertEqual(await sm.addHintCarryover(), 0);
    assertEqual(await sm.consumeHintCarryover(), 0);
    assertEqual(await sm.peekHintCarryover(), 0);
  });

  test("스토어 내부 오류는 false/null로 삼킴 (게임 계속)", async () => {
    class ThrowingStore implements ProgressStore {
      async put(): Promise<void> {
        throw new Error("boom");
      }
      async get(): Promise<ProgressRecord | null> {
        throw new Error("boom");
      }
      async delete(): Promise<void> {
        throw new Error("boom");
      }
      async list(): Promise<ProgressRecord[]> {
        throw new Error("boom");
      }
    }
    const sm = new SaveManager(new ThrowingStore(), new ThrowingStore());
    assertFalse(await sm.save(sample(1, 0)));
    assertFalse(await sm.saveBest(sample(1, 0)));
    assertEqual(await sm.load(1), null);
    assertFalse(await sm.delete(1));
    assertDeepEqual(await sm.list(), []);
    assertFalse(await sm.saveSession({ ...sample(1, 0), hintsLeft: 0 }));
    assertEqual(await sm.loadSession(1), null);
    assertFalse(await sm.clearSession(1));
    assertDeepEqual(await sm.listSessions(), []);
  });
});
