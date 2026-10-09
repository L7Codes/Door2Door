/** Map tiles are the only thing that grows. Keep each cache small, oldest tiles go first. */
export const TILE_CAPS: Record<string, number> = { 'tiles-street': 60, 'tiles-satellite': 100 };

export async function trimTiles(): Promise<number> {
  if (!('caches' in globalThis)) return 0;
  let kept = 0;
  try {
    for (const name of await caches.keys()) {
      if (!name.startsWith('tiles-')) continue;
      const cache = await caches.open(name);
      const keys = await cache.keys();
      const cap = TILE_CAPS[name] ?? 60;
      // keys come back oldest first
      for (const k of keys.slice(0, Math.max(0, keys.length - cap))) await cache.delete(k);
      kept += Math.min(keys.length, cap);
    }
  } catch {
    /* cache access is optional */
  }
  return kept;
}

export async function tileCount(): Promise<number> {
  if (!('caches' in globalThis)) return 0;
  let n = 0;
  try {
    for (const name of await caches.keys()) if (name.startsWith('tiles-')) n += (await (await caches.open(name)).keys()).length;
  } catch {
    /* ignore */
  }
  return n;
}
