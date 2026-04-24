import {
  describe,
  test,
  assertEqual,
} from "./runner";
import {
  computeStars,
  starsString,
  defaultStarThresholds,
} from "../src/game/Scoring";

describe("Scoring.computeStars", () => {
  const t: [number, number, number] = [100, 500, 1000];

  test("임계값 미달 → 0 별", () => {
    assertEqual(computeStars(0, t), 0);
    assertEqual(computeStars(99, t), 0);
  });
  test("★1 (>= threshold[0]) 획득", () => {
    assertEqual(computeStars(100, t), 1);
    assertEqual(computeStars(499, t), 1);
  });
  test("★2 (>= threshold[1]) 획득", () => {
    assertEqual(computeStars(500, t), 2);
    assertEqual(computeStars(999, t), 2);
  });
  test("★3 (>= threshold[2]) 획득", () => {
    assertEqual(computeStars(1000, t), 3);
    assertEqual(computeStars(9999, t), 3);
  });
});

describe("Scoring.starsString", () => {
  test("★★☆ 형식", () => {
    assertEqual(starsString(0), "☆☆☆");
    assertEqual(starsString(1), "★☆☆");
    assertEqual(starsString(2), "★★☆");
    assertEqual(starsString(3), "★★★");
  });
  test("범위 외 값은 clamp", () => {
    assertEqual(starsString(-5), "☆☆☆");
    assertEqual(starsString(10), "★★★");
  });
});

describe("Scoring.defaultStarThresholds", () => {
  test("오름차순 3개 임계값 생성", () => {
    const [s1, s2, s3] = defaultStarThresholds(6, 9, 60);
    if (!(s1 < s2 && s2 < s3)) {
      throw new Error(`오름차순 실패: ${s1},${s2},${s3}`);
    }
  });
  test("100 단위 반올림", () => {
    for (const v of defaultStarThresholds(6, 9, 60)) {
      assertEqual(v % 100, 0);
    }
  });
});
