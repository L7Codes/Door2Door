import { isStage } from './types';
import type { Cursor, House, Road, Snapshot } from './types';

const R = 6371000;

export function distance(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const r = Math.PI / 180;
  const dLat = (bLat - aLat) * r;
  const dLng = (bLng - aLng) * r;
  const x =
    Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

const ABBREV: Record<string, string> = {
  rd: 'road', ave: 'avenue', av: 'avenue', cl: 'close', st: 'street', dr: 'drive',
  ln: 'lane', cres: 'crescent', ct: 'court', gdns: 'gardens', pl: 'place', sq: 'square',
  ter: 'terrace', gr: 'grove', wy: 'way', pk: 'park'
};

/** "Kennington Ave" and "kennington avenue" are the same road. */
export function normaliseRoad(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => ABBREV[w] ?? w)
    .join(' ');
}

/**
 * Guess the next house number from the last few knocked.
 * Keeps the direction and step you are walking (2 for one side of a road).
 */
export function guessNext(nums: string[]): number {
  const n = nums.map((x) => parseInt(x, 10)).filter((x) => !Number.isNaN(x));
  if (!n.length) return 1;
  const last = n[n.length - 1];
  let step = 2;
  if (n.length > 1) {
    const d = last - n[n.length - 2];
    if (d !== 0 && Math.abs(d) <= 4) step = d;
  }
  return Math.max(1, last + step);
}

/** Road names repeat across towns, so a name only matches a road you have used within 600m. */
export function matchRoad(
  roads: Road[],
  houses: House[],
  name: string,
  lat: number,
  lng: number
): Road | null {
  const key = normaliseRoad(name);
  for (const r of roads) {
    if (normaliseRoad(r.name) !== key) continue;
    const near =
      distance(r.lat, r.lng, lat, lng) < 600 ||
      houses.some((h) => h.roadId === r.id && distance(h.lat, h.lng, lat, lng) < 600);
    if (near) return r;
  }
  return null;
}

export function nearbyRoads(roads: Road[], houses: House[], lat: number, lng: number): Road[] {
  const out: Road[] = [];
  for (const r of roads) {
    const near = houses.some((h) => h.roadId === r.id && distance(h.lat, h.lng, lat, lng) < 400);
    if (near) out.push(r);
  }
  return out;
}

export function startOfDay(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export interface Tally {
  doors: number;
  answered: number;
  booked: number;
  sales: number;
}

export function tally(houses: House[], now: number): Tally {
  const from = startOfDay(now);
  const t: Tally = { doors: 0, answered: 0, booked: 0, sales: 0 };
  for (const h of houses) {
    if (h.ts < from || h.status === 'none') continue;
    t.doors++;
    if (h.status !== 'noanswer' && !isStage(h.status)) t.answered++;
    if (h.status === 'appt') t.booked++;
    if (h.status === 'sale') t.sales++;
  }
  return t;
}

export function cursorFor(prev: Cursor | null, roadId: string, num: string, lat: number, lng: number): Cursor {
  const nums = (prev && prev.roadId === roadId ? prev.nums : []).concat([num]).slice(-4);
  return { roadId, lat, lng, nums };
}

/** Merge a backup into current data: newest version of each house wins. */
export function mergeSnapshots(current: Snapshot, incoming: Snapshot): Snapshot {
  const roads = new Map(current.roads.map((r) => [r.id, r]));
  for (const r of incoming.roads) if (!roads.has(r.id)) roads.set(r.id, r);
  const houses = new Map(current.houses.map((h) => [h.id, h]));
  for (const h of incoming.houses) {
    const have = houses.get(h.id);
    if (!have || h.ts > have.ts) houses.set(h.id, h);
  }
  const days = new Map((current.days ?? []).map((d) => [d.date, d]));
  for (const d of incoming.days ?? []) {
    const have = days.get(d.date);
    if (!have || d.doors > have.doors) days.set(d.date, d);
  }
  return { houses: [...houses.values()], roads: [...roads.values()], cursor: current.cursor, days: [...days.values()] };
}

/** 'YYYY-MM-DD' for a date a number of days from now, in local time. */
export function inDays(days: number, now = Date.now()): string {
  const d = new Date(now + days * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Empty houses whose check-back date has arrived. */
export function dueEmpty(houses: House[], now = Date.now()): House[] {
  const today = inDays(0, now);
  return houses.filter((h) => isStage(h.status) && h.appt && h.appt.slice(0, 10) <= today);
}

/** 14/10 style date for display. */
export function shortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}` : iso;
}

/** Append a stage change to a house's trail (one entry per status per day). */
export function addHist(hist: string | undefined, status: string, now = Date.now()): string {
  const entry = `${status}:${inDays(0, now)}`;
  const parts = (hist ?? '').split('|').filter(Boolean);
  if (parts[parts.length - 1] === entry) return hist ?? '';
  return parts.concat(entry).slice(-12).join('|');
}
