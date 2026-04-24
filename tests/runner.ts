/**
 * Make10 경량 테스트 러너.
 * 외부 테스트 프레임워크 없이 Node.js + ts-node 만으로 동작하도록 직접 구현한다.
 * 동일 디렉토리의 `*.test.ts` 파일을 자동으로 require 하여 등록된 테스트를 실행한다.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";

type TestFn = () => void | Promise<void>;

interface TestCase {
  readonly name: string;
  readonly fn: TestFn;
  readonly suite?: string;
}

const registry: TestCase[] = [];
const suiteStack: string[] = [];

export function describe(name: string, fn: () => void): void {
  suiteStack.push(name);
  try {
    fn();
  } finally {
    suiteStack.pop();
  }
}

export function test(name: string, fn: TestFn): void {
  const suite = suiteStack.length > 0 ? suiteStack.join(" > ") : undefined;
  registry.push({ name, fn, suite });
}

export const it = test;

export class AssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssertionError";
  }
}

function fmt(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "bigint") return `${value.toString()}n`;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function assertEqual<T>(actual: T, expected: T, msg?: string): void {
  if (!Object.is(actual, expected)) {
    throw new AssertionError(
      `${msg ?? "assertEqual"}: expected ${fmt(expected)}, got ${fmt(actual)}`,
    );
  }
}

export function assertNotEqual<T>(actual: T, expected: T, msg?: string): void {
  if (Object.is(actual, expected)) {
    throw new AssertionError(
      `${msg ?? "assertNotEqual"}: both values are ${fmt(actual)}`,
    );
  }
}

export function assertTrue(cond: boolean, msg?: string): void {
  if (!cond) {
    throw new AssertionError(msg ?? "assertTrue: condition was false");
  }
}

export function assertFalse(cond: boolean, msg?: string): void {
  if (cond) {
    throw new AssertionError(msg ?? "assertFalse: condition was true");
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const keysA = Object.keys(aObj);
  const keysB = Object.keys(bObj);
  if (keysA.length !== keysB.length) return false;
  for (const k of keysA) {
    if (!Object.prototype.hasOwnProperty.call(bObj, k)) return false;
    if (!deepEqual(aObj[k], bObj[k])) return false;
  }
  return true;
}

export function assertDeepEqual<T>(actual: T, expected: T, msg?: string): void {
  if (!deepEqual(actual, expected)) {
    throw new AssertionError(
      `${msg ?? "assertDeepEqual"}: expected ${fmt(expected)}, got ${fmt(actual)}`,
    );
  }
}

export function assertThrows(fn: () => unknown, msg?: string): void {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  if (!threw) {
    throw new AssertionError(msg ?? "assertThrows: function did not throw");
  }
}

export function assertCloseTo(
  actual: number,
  expected: number,
  epsilon = 1e-9,
  msg?: string,
): void {
  if (Math.abs(actual - expected) > epsilon) {
    throw new AssertionError(
      `${msg ?? "assertCloseTo"}: |${actual} - ${expected}| > ${epsilon}`,
    );
  }
}

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

async function run(): Promise<void> {
  const here = __dirname;
  const files = readdirSync(here)
    .filter((f) => f.endsWith(".test.ts"))
    .sort();
  for (const f of files) {
    // 파일 상단에서 describe/test 호출이 실행되어 registry에 등록된다.
    require(join(here, f));
  }

  let passed = 0;
  let failed = 0;
  const failures: string[] = [];

  const start = Date.now();
  for (const t of registry) {
    const label = t.suite ? `${t.suite} > ${t.name}` : t.name;
    try {
      await t.fn();
      passed++;
      console.log(`  ${GREEN}✓${RESET} ${label}`);
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      console.log(`  ${RED}✗${RESET} ${label}`);
      console.log(`    ${DIM}${message}${RESET}`);
      failures.push(label);
    }
  }
  const elapsed = Date.now() - start;

  const total = passed + failed;
  const summary =
    `\n${total} tests in ${elapsed}ms — ` +
    `${GREEN}${passed} passed${RESET}, ` +
    `${failed > 0 ? RED : DIM}${failed} failed${RESET}`;
  console.log(summary);

  if (failed > 0) {
    console.log(`\n${RED}Failures:${RESET}`);
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
  process.exit(0);
}

run().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
