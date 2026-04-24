/**
 * SaveManager — 진행 상황 저장/로드.
 *
 * IndexedDB를 일차 저장소로 사용하되, 실패/미지원 환경에서는 조용히 no-op으로 동작해
 * 게임은 계속 진행된다 (CLAUDE.md §8-2).
 *
 * 저장 로직은 `ProgressStore` 추상화 뒤에 두어 테스트에서 메모리 스토어로 교체할 수 있다.
 */
export interface ProgressRecord {
  readonly mapId: number;
  readonly boardState: ReadonlyArray<ReadonlyArray<number>>;
  readonly score: number;
  /** 이 기록 시점의 별점 (0~3). */
  readonly stars?: number;
  readonly timeLeft: number;
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

export interface IndexedDbProgressStoreOptions {
  readonly dbName?: string;
  readonly version?: number;
  readonly storeName?: string;
}

export class IndexedDbProgressStore implements ProgressStore {
  private readonly factory: IDBFactory;
  private readonly dbName: string;
  private readonly version: number;
  private readonly storeName: string;
  private dbPromise: Promise<IDBDatabase> | null;

  constructor(factory: IDBFactory, options: IndexedDbProgressStoreOptions = {}) {
    this.factory = factory;
    this.dbName = options.dbName ?? "make10db";
    this.version = options.version ?? 1;
    this.storeName = options.storeName ?? "progress";
    this.dbPromise = null;
  }

  private openDb(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      const req = this.factory.open(this.dbName, this.version);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: "mapId" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
      req.onblocked = () => reject(new Error("IndexedDB open blocked"));
    });
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

export class SaveManager {
  private readonly store: ProgressStore | null;

  constructor(store: ProgressStore | null) {
    this.store = store;
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
}

/**
 * 브라우저 환경에서 IndexedDB 기반 SaveManager를 생성. 실패하거나 지원되지 않으면
 * null 스토어를 가진 SaveManager(비가용)로 폴백한다.
 */
export function createDefaultSaveManager(): SaveManager {
  const g = globalThis as unknown as { indexedDB?: IDBFactory };
  if (!g.indexedDB) return new SaveManager(null);
  try {
    return new SaveManager(new IndexedDbProgressStore(g.indexedDB));
  } catch {
    return new SaveManager(null);
  }
}
