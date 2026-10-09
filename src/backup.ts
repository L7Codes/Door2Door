import type { DayRecord, House, Road, Snapshot, Status } from './types';
import { STATUS_LABEL } from './types';

const STATUSES = new Set<string>(['none', 'noanswer', 'no', 'follow', 'appt', 'sale', 'empty', 'reserved', 'movingin']);

export function makeBackup(s: Snapshot, now = Date.now()): string {
  return JSON.stringify({ app: 'door2door', version: 1, exportedAt: new Date(now).toISOString(), ...s });
}

const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Reads a backup file. Returns null if it is not a Door2Door backup. Bad rows are dropped, not trusted. */
export function parseBackup(text: string): Snapshot | null {
  let j: unknown;
  try {
    j = JSON.parse(text);
  } catch {
    return null;
  }
  if (!j || typeof j !== 'object') return null;
  const o = j as Record<string, unknown>;
  if (o['app'] !== 'door2door' || !Array.isArray(o['houses']) || !Array.isArray(o['roads'])) return null;

  const roads: Road[] = [];
  for (const r of o['roads'] as Record<string, unknown>[]) {
    const lat = num(r?.['lat']);
    const lng = num(r?.['lng']);
    if (!r || !str(r['id']) || lat === null || lng === null) continue;
    roads.push({ id: str(r['id']), name: str(r['name']), area: str(r['area']), lat, lng });
  }
  const houses: House[] = [];
  for (const h of o['houses'] as Record<string, unknown>[]) {
    const lat = num(h?.['lat']);
    const lng = num(h?.['lng']);
    if (!h || !str(h['id']) || lat === null || lng === null || !STATUSES.has(str(h['status']))) continue;
    houses.push({
      id: str(h['id']),
      roadId: h['roadId'] ? str(h['roadId']) : null,
      num: str(h['num']),
      lat,
      lng,
      status: str(h['status']) as Status,
      name: str(h['name']),
      phone: str(h['phone']),
      note: str(h['note']),
      appt: str(h['appt']),
      ts: num(h['ts']) ?? 0,
      hist: str(h['hist'])
    });
  }
  const c = o['cursor'] as Record<string, unknown> | null | undefined;
  const cursor =
    c && num(c['lat']) !== null && num(c['lng']) !== null && str(c['roadId'])
      ? {
          roadId: str(c['roadId']),
          lat: c['lat'] as number,
          lng: c['lng'] as number,
          nums: Array.isArray(c['nums']) ? (c['nums'] as unknown[]).map(str) : []
        }
      : null;
  const days: DayRecord[] = [];
  if (Array.isArray(o['days'])) {
    for (const d of o['days'] as Record<string, unknown>[]) {
      const date = str(d?.['date']);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      const n = (k: string): number => num(d[k]) ?? 0;
      days.push({
        date, doors: n('doors'), noanswer: n('noanswer'), answered: n('answered'), no: n('no'), follow: n('follow'),
        appt: n('appt'), sale: n('sale'), stages: n('stages'), roads: n('roads'), first: n('first'), last: n('last'),
        finished: d['finished'] === true
      });
    }
  }
  return { houses, roads, cursor, days };
}

/** Spreadsheet formulas can hide in text fields; a leading quote keeps them as plain text. */
function safeCell(v: unknown): string {
  let s = str(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

export function toCsv(s: Snapshot): string {
  const head = ['Road', 'Area', 'Number', 'Status', 'Name', 'Phone', 'Note', 'Appointment / check back', 'History', 'Lat', 'Lng', 'When'];
  const rows = s.houses.map((h) => {
    const r = s.roads.find((x) => x.id === h.roadId);
    return [r?.name ?? '', r?.area ?? '', h.num, STATUS_LABEL[h.status], h.name, h.phone, h.note, h.appt, h.hist ?? '', h.lat, h.lng, new Date(h.ts).toISOString()];
  });
  return [head, ...rows].map((row) => row.map(safeCell).join(',')).join('\n');
}

/** Opens the iPhone share sheet (Save to Files / iCloud Drive) or falls back to a download. */
export async function saveFile(name: string, mime: string, text: string): Promise<boolean> {
  const file = new File([text], name, { type: mime });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare && nav.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return true;
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return false;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
  return true;
}
