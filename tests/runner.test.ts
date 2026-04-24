/**
 * 테스트 러너 자체의 어설션 함수에 대한 셀프 체크.
 */
import {
  describe,
  test,
  assertEqual,
  assertNotEqual,
  assertTrue,
  assertFalse,
  assertDeepEqual,
  assertThrows,
  assertCloseTo,
} from "./runner";

describe("runner assertions", () => {
  test("assertEqual: primitive equality", () => {
    assertEqual(1 + 1, 2);
    assertEqual("foo", "foo");
  });

  test("assertNotEqual: detects inequality", () => {
    assertNotEqual(1, 2);
  });

  test("assertTrue/assertFalse", () => {
    assertTrue(true);
    assertFalse(false);
  });

  test("assertDeepEqual: nested objects", () => {
    assertDeepEqual({ a: [1, 2, { b: 3 }] }, { a: [1, 2, { b: 3 }] });
  });

  test("assertThrows: catches throwing fn", () => {
    assertThrows(() => {
      throw new Error("boom");
    });
  });

  test("assertThrows: fails when fn does not throw", () => {
    assertThrows(() => {
      assertThrows(() => {
        /* does not throw */
      });
    });
  });

  test("assertCloseTo: floating point tolerance", () => {
    assertCloseTo(0.1 + 0.2, 0.3, 1e-9);
  });
});
