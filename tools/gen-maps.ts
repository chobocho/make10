/**
 * gen-maps.ts — data/mapNNN.json 를 프로시저럴하게 생성.
 *
 * 실행:  npx ts-node tools/gen-maps.ts [fromId=1] [toId=10]
 *
 * 1~9 사이 임의 숫자로 보드를 채운 뒤, 초기 유효 조합(합=10)이 최소 1개 이상
 * 존재하는지 검증해 없으면 재시도한다. 중력 적용(Bejeweled 스타일) 하에서
 * 자명하게 전체 클리어가 가능할 필요는 없다.
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { Board } from "../src/game/Board";
import { findValidCombination } from "../src/game/Hint";
import { defaultStarThresholds, StarThresholds } from "../src/game/Scoring";

interface MapSpec {
  id: number;
  name: string;
  cols: number;
  rows: number;
  timeLimit: number;
  hintCount: number;
  targetScore: number;
  starThresholds: StarThresholds;
  initialBoard: number[][];
  initialLives?: number[][];
  initialObstacles?: number[][];
}

/**
 * 장애물 도입 구간:
 *   - id 101~199: 가벼운 도입 — 비율 [1%, 2%], 절대 cap 2%.
 *   - id ≥ 200:   본격 — 비율 [3%, 5%], 절대 cap 5%.
 *   - id < 101:   장애물 없음.
 */
const OBSTACLE_MIN_ID = 101;
function obstacleRatiosFor(id: number): { min: number; max: number; cap: number } {
  if (id < 200) return { min: 0.01, max: 0.02, cap: 0.02 };
  return { min: 0.03, max: 0.05, cap: 0.05 };
}

/**
 * id에 따른 멀티라이프 최댓값.
 *   - id < 10: 멀티라이프 없음 (일반 lives=1)
 *   - id 10~19: 최대 lives=2
 *   - id 20~29: 최대 lives=3
 *   - id 30~39: 최대 lives=4
 *   - id ≥ 40: 최대 lives=5 (캡)
 */
function maxLifeForId(id: number): number {
  if (id < 10) return 1;
  return Math.min(5, 1 + Math.floor(id / 10));
}

/**
 * 보드 셀의 15% 이하 갯수만큼 멀티라이프 셀을 무작위 배치한다.
 * 각 멀티라이프 셀의 lives는 [2..maxLife] 균등 분포.
 * @returns initialLives 2D 배열 (모두 1로 초기화 후 일부를 2~maxLife 로 덮어씀)
 */
function genInitialLives(
  cols: number,
  rows: number,
  maxLife: number,
  rand: () => number,
): number[][] {
  const lives: number[][] = [];
  for (let r = 0; r < rows; r++) lives.push(new Array(cols).fill(1));
  if (maxLife < 2) return lives;
  const total = cols * rows;
  const limit = Math.floor(total * 0.15);
  if (limit <= 0) return lives;
  // 15% 한도 내에서 약간의 변동을 주되 한도는 절대 초과하지 않음.
  // 난이도가 높을수록 멀티 비율을 늘리고 평균 lives 도 증가.
  const minRatio = 0.05;
  const maxRatio = 0.15;
  const t = Math.min(1, (maxLife - 1) / 4); // 1→0, 5→1
  const ratio = minRatio + (maxRatio - minRatio) * t;
  const target = Math.min(limit, Math.max(1, Math.round(total * ratio)));
  // 셀 인덱스를 무작위로 섞어 앞 target 개를 선택.
  const indices: number[] = [];
  for (let i = 0; i < total; i++) indices.push(i);
  for (let i = total - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  for (let i = 0; i < target; i++) {
    const idx = indices[i];
    const r = Math.floor(idx / cols);
    const c = idx % cols;
    // [2..maxLife] 균등 정수 — 큰 lives는 더 드물게(quad 분포)로 약간 보정.
    const u = rand();
    const span = maxLife - 1; // 2..maxLife는 span 개의 단계
    // 가벼운 비선형: u^1.4 → 큰 lives 빈도가 줄어듦.
    const idxLife = Math.min(span - 1, Math.floor(Math.pow(u, 1.4) * span));
    lives[r][c] = 2 + idxLife;
  }
  return lives;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function genRandomBoard(cols: number, rows: number, rand: () => number): number[][] {
  const board: number[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: number[] = [];
    for (let c = 0; c < cols; c++) {
      row.push(1 + Math.floor(rand() * 9));
    }
    board.push(row);
  }
  return board;
}

/**
 * 초기 유효 조합(합=10)이 1개 이상 존재할 때까지 최대 N회 재시도.
 * 실패 시 보드의 0행 앞 두 칸을 강제로 (3,7)로 세팅해 강제 만족.
 * obstacles가 주어지면 검증 시 함께 전달해 "장애물에 막혀 인접 조합이 사라지는" 케이스를 거른다.
 */
function genBoardWithInitialCombo(
  cols: number,
  rows: number,
  rand: () => number,
  maxAttempts = 200,
  obstacles?: number[][],
): number[][] {
  for (let i = 0; i < maxAttempts; i++) {
    const board = genRandomBoard(cols, rows, rand);
    if (obstacles) {
      // 장애물 자리 보드값은 0으로 비워야 Board 생성자에서 정합성 통과.
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (obstacles[r][c] === 1) board[r][c] = 0;
        }
      }
    }
    const b = new Board(board, undefined, obstacles);
    if (findValidCombination(b)) return board;
  }
  // 폴백: 0행 앞 두 칸을 강제로 (3,7) 인접 쌍으로 세팅.
  const board = genRandomBoard(cols, rows, rand);
  if (obstacles) {
    obstacles[0][0] = 0;
    obstacles[0][1] = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (obstacles[r][c] === 1) board[r][c] = 0;
      }
    }
  }
  board[0][0] = 3;
  board[0][1] = 7;
  return board;
}

/**
 * 해당 id의 장애물 배치를 생성한다. 단순 셔플 표본 추출로 같은 행 양 끝 동시 장애물 같은 극단 분포를 회피.
 * 최소 1개는 보장 — id 101 부터 도입을 가시적으로 인지시키기 위함.
 */
function genObstacles(
  cols: number,
  rows: number,
  rand: () => number,
  id: number,
): number[][] {
  const total = cols * rows;
  const { min, max, cap } = obstacleRatiosFor(id);
  const ratio = min + rand() * (max - min);
  const capCount = Math.floor(total * cap);
  const target = Math.min(capCount, Math.max(1, Math.round(total * ratio)));
  const indices: number[] = [];
  for (let i = 0; i < total; i++) indices.push(i);
  for (let i = total - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const obstacles: number[][] = [];
  for (let r = 0; r < rows; r++) obstacles.push(new Array(cols).fill(0));
  for (let i = 0; i < target; i++) {
    const idx = indices[i];
    const r = Math.floor(idx / cols);
    const c = idx % cols;
    obstacles[r][c] = 1;
  }
  return obstacles;
}

interface Preset {
  readonly id: number;
  readonly name: string;
  readonly cols: number;
  readonly rows: number;
  readonly timeLimit: number;
  readonly hintCount: number;
}

function presetFor(id: number): Preset {
  const name = (() => {
    if (id <= 2) return `튜토리얼 ${id}`;
    if (id <= 10) return `초급 ${id - 2}`;
    if (id <= 30) return `중급 ${id - 10}`;
    if (id <= 60) return `상급 ${id - 30}`;
    if (id <= 100) return `전문가 ${id - 60}`;
    if (id <= 150) return `마스터 ${id - 100}`;
    if (id < 200) return `그랜드마스터 ${id - 150}`;
    if (id <= 250) return `장애물 입문 ${id - 199}`;
    return `장애물 마스터 ${id - 250}`;
  })();
  // 난이도 테이블 — id가 클수록 격자 크기/시간 압박/힌트 축소
  let cols = 6;
  let rows = 9;
  let timeLimit = 60;
  let hintCount = 1;
  if (id <= 2) {
    cols = 4;
    rows = id === 1 ? 5 : 7;
    timeLimit = 120;
    hintCount = 3;
  } else if (id <= 4) {
    cols = 6;
    rows = id === 3 ? 5 : 6;
    timeLimit = 100;
    hintCount = 3;
  } else if (id <= 10) {
    cols = 6;
    rows = id <= 6 ? 7 + (id - 5) : 9;
    timeLimit = id <= 6 ? 90 : id <= 8 ? 80 : 70;
    hintCount = id <= 8 ? 2 : 1;
  } else if (id <= 30) {
    cols = 6;
    rows = 9;
    timeLimit = 70 - Math.floor((id - 10) / 5);
    hintCount = 2;
  } else if (id <= 60) {
    cols = 6;
    rows = 9;
    timeLimit = 65 - Math.floor((id - 30) / 6);
    hintCount = 1;
  } else if (id <= 100) {
    cols = 6;
    rows = 9;
    timeLimit = 60 - Math.floor((id - 60) / 10);
    hintCount = 1;
  } else if (id < 200) {
    // 마스터/그랜드마스터: 6x9, 시간 압박 강화. 100 → 55, 199 → 35 선형 감소.
    cols = 6;
    rows = 9;
    timeLimit = Math.max(35, 55 - Math.floor((id - 100) / 5));
    hintCount = id < 150 ? 1 : id < 180 ? 1 : 0;
  } else {
    // 장애물 구간: 6x9, 시간은 200→55에서 300→30으로 완만히 줄임 (장애물로 난이도 보조).
    cols = 6;
    rows = 9;
    timeLimit = Math.max(30, 55 - Math.floor((id - 200) / 4));
    hintCount = id < 250 ? 1 : 0;
  }
  return { id, name, cols, rows, timeLimit, hintCount };
}

export function generateMap(id: number): MapSpec {
  const preset = presetFor(id);
  const rand = mulberry32(preset.id * 2654435761);
  // 장애물은 보드 생성 검증 단계에서 함께 고려해야 하므로 먼저 생성.
  const obstacles =
    id >= OBSTACLE_MIN_ID
      ? genObstacles(preset.cols, preset.rows, rand, id)
      : undefined;
  const initialBoard = genBoardWithInitialCombo(
    preset.cols,
    preset.rows,
    rand,
    200,
    obstacles,
  );
  const starThresholds = defaultStarThresholds(
    preset.cols,
    preset.rows,
    preset.timeLimit,
  );
  const maxLife = maxLifeForId(id);
  const spec: MapSpec = {
    id: preset.id,
    name: preset.name,
    cols: preset.cols,
    rows: preset.rows,
    timeLimit: preset.timeLimit,
    hintCount: preset.hintCount,
    targetScore: 0,
    starThresholds,
    initialBoard,
  };
  if (maxLife >= 2) {
    // 장애물 셀에는 lives=0 강제. genInitialLives 가 모든 셀을 1로 시작하므로 후처리.
    const lives = genInitialLives(preset.cols, preset.rows, maxLife, rand);
    if (obstacles) {
      for (let r = 0; r < preset.rows; r++) {
        for (let c = 0; c < preset.cols; c++) {
          if (obstacles[r][c] === 1) lives[r][c] = 0;
        }
      }
    }
    spec.initialLives = lives;
  }
  if (obstacles) {
    spec.initialObstacles = obstacles;
  }
  return spec;
}

function writeMap(outDir: string, spec: MapSpec): string {
  const filename = `map${String(spec.id).padStart(3, "0")}.json`;
  const path = join(outDir, filename);
  writeFileSync(path, JSON.stringify(spec, null, 2) + "\n");
  return path;
}

function main(): void {
  const args = process.argv.slice(2);
  const from = args[0] ? Number.parseInt(args[0], 10) : 1;
  const to = args[1] ? Number.parseInt(args[1], 10) : 10;
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from) {
    throw new Error(`사용법: gen-maps.ts [fromId=1] [toId=10]. (${from}..${to})`);
  }
  const outDir = resolve(__dirname, "..", "data");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  for (let id = from; id <= to; id++) {
    const spec = generateMap(id);
    const path = writeMap(outDir, spec);
    console.log(
      `wrote ${path}  [${spec.cols}x${spec.rows}, ${spec.timeLimit}s, hints=${spec.hintCount}]`,
    );
  }
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

// dirname/join 참조 유지 (번들러 경고 방지용).
void dirname;
