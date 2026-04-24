/**
 * gen-maps.ts — data/mapNNN.json 를 프로시저럴하게 생성.
 *
 * 실행:  npx ts-node tools/gen-maps.ts [fromId=1] [toId=10]
 *
 * 합이 10인 수평 쌍을 타일링한 보드를 생성한다. 모든 보드는 자명하게 solvable(2셀 쌍으로 완전히 클리어 가능).
 * 난이도는 맵 크기 + timeLimit + hintCount로 조절한다.
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

interface MapSpec {
  id: number;
  name: string;
  cols: number;
  rows: number;
  timeLimit: number;
  hintCount: number;
  targetScore: number;
  initialBoard: number[][];
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

const PAIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 9],
  [2, 8],
  [3, 7],
  [4, 6],
  [5, 5],
  [9, 1],
  [8, 2],
  [7, 3],
  [6, 4],
];

function genPairBoard(cols: number, rows: number, rand: () => number): number[][] {
  if (cols % 2 !== 0) {
    throw new Error(`cols는 짝수여야 합니다 (받음: ${cols}).`);
  }
  const board: number[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: number[] = [];
    for (let c = 0; c < cols; c += 2) {
      const p = PAIRS[Math.floor(rand() * PAIRS.length)];
      row.push(p[0], p[1]);
    }
    board.push(row);
  }
  return board;
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
    return `전문가 ${id - 60}`;
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
  } else {
    cols = 6;
    rows = 9;
    timeLimit = 60 - Math.floor((id - 60) / 10);
    hintCount = 1;
  }
  if (cols % 2 !== 0) cols += 1;
  return { id, name, cols, rows, timeLimit, hintCount };
}

export function generateMap(id: number): MapSpec {
  const preset = presetFor(id);
  const rand = mulberry32(preset.id * 2654435761);
  const initialBoard = genPairBoard(preset.cols, preset.rows, rand);
  return {
    id: preset.id,
    name: preset.name,
    cols: preset.cols,
    rows: preset.rows,
    timeLimit: preset.timeLimit,
    hintCount: preset.hintCount,
    targetScore: 0,
    initialBoard,
  };
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
