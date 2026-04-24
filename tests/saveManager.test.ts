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
    const sm = new SaveManager(new ThrowingStore());
    assertFalse(await sm.save(sample(1, 0)));
    assertFalse(await sm.saveBest(sample(1, 0)));
    assertEqual(await sm.load(1), null);
    assertFalse(await sm.delete(1));
    assertDeepEqual(await sm.list(), []);
  });
});
