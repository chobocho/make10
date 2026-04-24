/**
 * 별점(Star) 계산 — 점수를 맵별 임계값 3개(오름차순)와 비교해 0~3 별점을 산출한다.
 */
export type StarThresholds = readonly [number, number, number];

export function computeStars(score: number, thresholds: StarThresholds): number {
  if (score >= thresholds[2]) return 3;
  if (score >= thresholds[1]) return 2;
  if (score >= thresholds[0]) return 1;
  return 0;
}

/** UI 표기용 ★★☆ 형태 문자열. */
export function starsString(stars: number): string {
  const n = Math.max(0, Math.min(3, Math.floor(stars)));
  return "★".repeat(n) + "☆".repeat(3 - n);
}

/**
 * 임계값 기본 공식 — 보드 크기와 제한 시간을 기반으로 대략적 난이도 산정.
 * 필요 시 맵별로 수동 오버라이드 가능 (JSON에 명시).
 */
export function defaultStarThresholds(
  cols: number,
  rows: number,
  timeLimit: number,
): StarThresholds {
  const base = cols * rows * timeLimit;
  const s1 = Math.round((base * 0.5) / 100) * 100;
  const s2 = Math.round((base * 1.2) / 100) * 100;
  const s3 = Math.round((base * 2.0) / 100) * 100;
  return [Math.max(100, s1), Math.max(s1 + 100, s2), Math.max(s2 + 100, s3)];
}
