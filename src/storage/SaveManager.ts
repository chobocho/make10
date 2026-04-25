/**
 * SaveManager — 진행 상황 저장/로드.
 *
 * IndexedDB를 일차 저장소로 사용하되, 실패/미지원 환경에서는 조용히 no-op으로 동작해
 * 게임은 계속 진행된다 (CLAUDE.md §8-2).
 *
 * 두 종류의 저장소를 사용한다:
 *   - progress: 맵별 최고 점수 기록 (영속, 갱신은 saveBest 로 더 높을 때만).
 *   - session: 진행 중인 1회용 게임 상태 (탭 전환/브라우저 종료 후 복구). 매 일시정지 시 덮어씀.
 *
 * 두 스토어는 동일한 IndexedDB(`make10db`) 안의 별도 object store 로 분리되어 서로 영향이 없다.
 */
export interface ProgressRecord {
  readonly mapId: number;
  readonly boardState: ReadonlyArray<ReadonlyArray<number>>;
  readonly score: number;
  /** 이 기록 시점의 별점 (0~3). */
  readonly stars?: number;
  readonly timeLeft: number;
  /** 세션 복원용 — 일시정지 시점의 남은 힌트 횟수. progress(최고 점수) 기록에서는 무시된다. */
  readonly hintsLeft?: number;
  /** 세션 복원용 — 셀별 lives 배열 (boardState 와 차원 동일). 미설정이면 모두 1로 복원. */
  readonly boardLives?: ReadonlyArray<ReadonlyArray<number>>;
  /** 세션 복원용 — 셀별 장애물 여부(0/1). 미설정이면 장애물 없음. */
  readonly boardObstacles?: ReadonlyArray<ReadonlyArray<number>>;
  /** 세션 복원용 — 셀별 만능(?) 여부(0/1). 미설정이면 만능 블럭 없음. */
  readonly boardWildcards?: ReadonlyArray<ReadonlyArray<number>>;
  /** 세션 복원용 — 셀별 보너스(×2) 플래그(0/1). 미설정이면 보너스 없음. */
  readonly boardBonus?: ReadonlyArray<ReadonlyArray<number>>;
  readonly timestamp: number;
}

export interface ProgressStore {
  put(record: ProgressRecord): Promise<void>;
  get(mapId: number): Promise<ProgressRecord | null>;
  delete(mapId: number): Promise<void>;
  list(): Promise<ProgressRecord[]>;
}

export class MemoryProgressStore implements ProgressStore {
  private readonly map: Map<number, ProgressRecord> = new Map();

  async put(record: ProgressRecord): Promise<void> {
    this.map.set(record.mapId, record);
  }

  async get(mapId: number): Promise<ProgressRecord | null> {
    return this.map.get(mapId) ?? null;
  }

  async delete(mapId: number): Promise<void> {
    this.map.delete(mapId);
  }

  async list(): Promise<ProgressRecord[]> {
    return Array.from(this.map.values()).sort((a, b) => a.mapId - b.mapId);
  }
}

const DB_VERSION = 3;
const STORE_PROGRESS = "progress";
const STORE_SESSION = "session";
const STORE_META = "meta";

/**
 * 공유 DB 오픈. 세 스토어(progress/session/meta)를 동일 DB 인스턴스에서 관리하기 위한 단일 진입점.
 * 누락된 스토어만 생성하므로 기존 데이터는 보존된다.
 *   - v1 → 최초 progress 스토어 생성
 *   - v2 → session 스토어 추가
 *   - v3 → meta 스토어 추가 (튜토리얼 완료 등 키-값 메타)
 */
function openMake10Db(factory: IDBFactory, dbName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = factory.open(dbName, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PROGRESS)) {
        db.createObjectStore(STORE_PROGRESS, { keyPath: "mapId" });
      }
      if (!db.objectStoreNames.contains(STORE_SESSION)) {
        db.createObjectStore(STORE_SESSION, { keyPath: "mapId" });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
    req.onblocked = () => reject(new Error("IndexedDB open blocked"));
  });
}

export interface IndexedDbProgressStoreOptions {
  readonly dbName?: string;
  readonly storeName?: string;
}

export class IndexedDbProgressStore implements ProgressStore {
  private readonly factory: IDBFactory;
  private readonly dbName: string;
  private readonly storeName: string;
  private dbPromise: Promise<IDBDatabase> | null;

  constructor(factory: IDBFactory, options: IndexedDbProgressStoreOptions = {}) {
    this.factory = factory;
    this.dbName = options.dbName ?? "make10db";
    this.storeName = options.storeName ?? STORE_PROGRESS;
    this.dbPromise = null;
  }

  private openDb(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = openMake10Db(this.factory, this.dbName);
    return this.dbPromise;
  }

  async put(record: ProgressRecord): Promise<void> {
    const db = await this.openDb();
    await this.runRW(db, (s) => s.put(record as unknown as Record<string, unknown>));
  }

  async get(mapId: number): Promise<ProgressRecord | null> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, "readonly");
      const req = tx.objectStore(this.storeName).get(mapId);
      req.onsuccess = () => {
        const v = req.result;
        resolve((v as ProgressRecord | undefined) ?? null);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async delete(mapId: number): Promise<void> {
    const db = await this.openDb();
    await this.runRW(db, (s) => s.delete(mapId));
  }

  async list(): Promise<ProgressRecord[]> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, "readonly");
      const req = tx.objectStore(this.storeName).getAll();
      req.onsuccess = () => {
        const arr = (req.result as ProgressRecord[]) ?? [];
        resolve(arr.slice().sort((a, b) => a.mapId - b.mapId));
      };
      req.onerror = () => reject(req.error);
    });
  }

  private runRW(
    db: IDBDatabase,
    op: (store: IDBObjectStore) => IDBRequest,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, "readwrite");
      const req = op(tx.objectStore(this.storeName));
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
}

/**
 * 키-값 메타 스토어 — 게임 단일 인스턴스 단위의 영속 플래그/설정 저장소.
 * progress(맵별)·session(맵별 진행상태)과 별개의 도메인.
 */
export interface MetaStore {
  set(key: string, value: unknown): Promise<void>;
  get(key: string): Promise<unknown>;
  delete(key: string): Promise<void>;
}

export class MemoryMetaStore implements MetaStore {
  private readonly map: Map<string, unknown> = new Map();

  async set(key: string, value: unknown): Promise<void> {
    this.map.set(key, value);
  }

  async get(key: string): Promise<unknown> {
    return this.map.has(key) ? this.map.get(key) : null;
  }

  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }
}

export class IndexedDbMetaStore implements MetaStore {
  private readonly factory: IDBFactory;
  private readonly dbName: string;
  private dbPromise: Promise<IDBDatabase> | null;

  constructor(factory: IDBFactory, dbName: string = "make10db") {
    this.factory = factory;
    this.dbName = dbName;
    this.dbPromise = null;
  }

  private openDb(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = openMake10Db(this.factory, this.dbName);
    return this.dbPromise;
  }

  async set(key: string, value: unknown): Promise<void> {
    const db = await this.openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_META, "readwrite");
      tx.objectStore(STORE_META).put({ key, value, updatedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  async get(key: string): Promise<unknown> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_META, "readonly");
      const req = tx.objectStore(STORE_META).get(key);
      req.onsuccess = () => {
        const v = req.result as { key: string; value: unknown } | undefined;
        resolve(v ? v.value : null);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async delete(key: string): Promise<void> {
    const db = await this.openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_META, "readwrite");
      tx.objectStore(STORE_META).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
}

const META_KEY_TUTORIAL_DONE = "tutorial_done";

export class SaveManager {
  private readonly store: ProgressStore | null;
  private readonly sessionStore: ProgressStore | null;
  private readonly metaStore: MetaStore | null;

  constructor(
    store: ProgressStore | null,
    sessionStore: ProgressStore | null = null,
    metaStore: MetaStore | null = null,
  ) {
    this.store = store;
    this.sessionStore = sessionStore;
    this.metaStore = metaStore;
  }

  isAvailable(): boolean {
    return this.store !== null;
  }

  async save(record: ProgressRecord): Promise<boolean> {
    if (!this.store) return false;
    try {
      await this.store.put(record);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 동일 mapId에 대해 기존 점수보다 높을 때만 덮어쓴다. 동점이면 유지.
   * 최고 점수/시간 기록 보존 용도. 저장 여부를 boolean 으로 반환.
   */
  async saveBest(record: ProgressRecord): Promise<boolean> {
    if (!this.store) return false;
    try {
      const existing = await this.store.get(record.mapId);
      if (existing && existing.score >= record.score) return false;
      await this.store.put(record);
      return true;
    } catch {
      return false;
    }
  }

  async load(mapId: number): Promise<ProgressRecord | null> {
    if (!this.store) return null;
    try {
      return await this.store.get(mapId);
    } catch {
      return null;
    }
  }

  async delete(mapId: number): Promise<boolean> {
    if (!this.store) return false;
    try {
      await this.store.delete(mapId);
      return true;
    } catch {
      return false;
    }
  }

  async list(): Promise<ProgressRecord[]> {
    if (!this.store) return [];
    try {
      return await this.store.list();
    } catch {
      return [];
    }
  }

  // --- 세션(진행 중 게임) API ---
  // progress 와 분리된 별도 스토어. 일시정지 시 덮어쓰고, 게임 종료/메인/다시하기 시 삭제.

  async saveSession(record: ProgressRecord): Promise<boolean> {
    if (!this.sessionStore) return false;
    try {
      await this.sessionStore.put(record);
      return true;
    } catch {
      return false;
    }
  }

  async loadSession(mapId: number): Promise<ProgressRecord | null> {
    if (!this.sessionStore) return null;
    try {
      return await this.sessionStore.get(mapId);
    } catch {
      return null;
    }
  }

  async clearSession(mapId: number): Promise<boolean> {
    if (!this.sessionStore) return false;
    try {
      await this.sessionStore.delete(mapId);
      return true;
    } catch {
      return false;
    }
  }

  /** 모든 진행 중 세션을 timestamp 내림차순(최신 우선)으로 반환. */
  async listSessions(): Promise<ProgressRecord[]> {
    if (!this.sessionStore) return [];
    try {
      const all = await this.sessionStore.list();
      return all.slice().sort((a, b) => b.timestamp - a.timestamp);
    } catch {
      return [];
    }
  }

  // --- 메타 (튜토리얼 등) API ---

  async markTutorialDone(): Promise<boolean> {
    if (!this.metaStore) return false;
    try {
      await this.metaStore.set(META_KEY_TUTORIAL_DONE, true);
      return true;
    } catch {
      return false;
    }
  }

  async isTutorialDone(): Promise<boolean> {
    if (!this.metaStore) return false;
    try {
      const v = await this.metaStore.get(META_KEY_TUTORIAL_DONE);
      return v === true;
    } catch {
      return false;
    }
  }

  /** 테스트/디버그 용 — 튜토리얼 완료 마크를 제거해 다시 표시되게 한다. */
  async resetTutorial(): Promise<boolean> {
    if (!this.metaStore) return false;
    try {
      await this.metaStore.delete(META_KEY_TUTORIAL_DONE);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * 브라우저 환경에서 IndexedDB 기반 SaveManager를 생성. 실패하거나 지원되지 않으면
 * null 스토어를 가진 SaveManager(비가용)로 폴백한다.
 */
export function createDefaultSaveManager(): SaveManager {
  const g = globalThis as unknown as { indexedDB?: IDBFactory };
  if (!g.indexedDB) return new SaveManager(null, null, null);
  try {
    const progress = new IndexedDbProgressStore(g.indexedDB, {
      storeName: STORE_PROGRESS,
    });
    const session = new IndexedDbProgressStore(g.indexedDB, {
      storeName: STORE_SESSION,
    });
    const meta = new IndexedDbMetaStore(g.indexedDB);
    return new SaveManager(progress, session, meta);
  } catch {
    return new SaveManager(null, null, null);
  }
}
