/** The app no longer stores map pictures. This removes any saved by earlier versions. */
export async function clearOldTiles(): Promise<void> {
  if (!('caches' in globalThis)) return;
  try {
    for (const name of await caches.keys()) if (name.startsWith('tiles-')) await caches.delete(name);
  } catch {
    /* cache access is optional */
  }
}
