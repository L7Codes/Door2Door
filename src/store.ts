import type { Cursor, House, Road, Snapshot } from './types';

const DB_NAME = 'door2door';
const DB_VERSION = 1;

type Listener = () => void;

/**
 * Everything lives in memory for speed and is mirrored to IndexedDB.
 * If IndexedDB is unavailable (some private modes) the app still works, but `durable` is false.
 */
class Store {
  houses: House[] = [];
  roads: Road[] = [];
  cursor: Cursor | null = null;
  meta: Record<string, unknown> = {};
  durable = false;

  private db: IDBDatabase | null = null;
  private listeners = new Set<Listener>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    this.listeners.forEach((fn) => fn());
  }

  async load(): Promise<void> {
    try {
      this.db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          db.createObjectStore('houses', { keyPath: 'id' });
          db.createObjectStore('roads', { keyPath: 'id' });
          db.createObjectStore('meta', { keyPath: 'key' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      this.houses = await this.getAll<House>('houses');
      this.roads = await this.getAll<Road>('roads');
      const meta = await this.getAll<{ key: string; value: unknown }>('meta');
      for (const m of meta) this.meta[m.key] = m.value;
      this.cursor = (this.meta['cursor'] as Cursor | null | undefined) ?? null;
      this.durable = true;
    } catch {
      this.db = null;
      this.durable = false;
    }
    this.emit();
  }

  private getAll<T>(store: string): Promise<T[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve([]);
      const req = this.db.transaction(store, 'readonly').objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result as T[]);
      req.onerror = () => reject(req.error);
    });
  }

  private write(store: string, op: (s: IDBObjectStore) => void): Promise<void> {
    return new Promise((resolve) => {
      if (!this.db) return resolve();
      try {
        const tx = this.db.transaction(store, 'readwrite');
        op(tx.objectStore(store));
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  async putHouse(h: House): Promise<void> {
    const i = this.houses.findIndex((x) => x.id === h.id);
    if (i >= 0) this.houses[i] = h;
    else this.houses.push(h);
    this.emit();
    await this.write('houses', (s) => void s.put(h));
  }

  async deleteHouse(id: string): Promise<void> {
    this.houses = this.houses.filter((h) => h.id !== id);
    this.emit();
    await this.write('houses', (s) => void s.delete(id));
  }

  async putRoad(r: Road): Promise<void> {
    const i = this.roads.findIndex((x) => x.id === r.id);
    if (i >= 0) this.roads[i] = r;
    else this.roads.push(r);
    this.emit();
    await this.write('roads', (s) => void s.put(r));
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    this.meta[key] = value;
    await this.write('meta', (s) => void s.put({ key, value }));
  }

  async setCursor(c: Cursor | null): Promise<void> {
    this.cursor = c;
    await this.setMeta('cursor', c);
  }

  snapshot(): Snapshot {
    return {
      houses: structuredClone(this.houses),
      roads: structuredClone(this.roads),
      cursor: structuredClone(this.cursor)
    };
  }

  async replaceAll(s: Snapshot): Promise<void> {
    this.houses = s.houses;
    this.roads = s.roads;
    this.cursor = s.cursor;
    this.emit();
    await this.write('houses', (st) => {
      st.clear();
      s.houses.forEach((h) => st.put(h));
    });
    await this.write('roads', (st) => {
      st.clear();
      s.roads.forEach((r) => st.put(r));
    });
    await this.setMeta('cursor', s.cursor);
  }

  road(id: string | null): Road | null {
    if (!id) return null;
    return this.roads.find((r) => r.id === id) ?? null;
  }

  house(id: string): House | null {
    return this.houses.find((h) => h.id === id) ?? null;
  }
}

export const store = new Store();
export { Store };
