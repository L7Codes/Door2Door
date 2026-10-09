import { inDays, startOfDay } from './logic';
import { store } from './store';
import { isStage } from './types';
import type { DayCounts, DayRecord, House } from './types';

const dayKey = (ts: number): string => inDays(0, ts);

const blankCounts = (): DayCounts => ({ doors: 0, noanswer: 0, answered: 0, no: 0, follow: 0, left: 0, appt: 0, sale: 0, stages: 0 });

function addTo(c: DayCounts, status: House['status']): void {
  c.doors++;
  if (status === 'noanswer') c.noanswer++;
  else if (isStage(status)) c.stages++;
  else {
    c.answered++;
    if (status === 'no') c.no++;
    else if (status === 'follow') c.follow++;
    else if (status === 'appt') c.appt++;
    else if (status === 'sale') c.sale++;
    else if (status === 'left') c.left++;
  }
}

/** Count what happened on one local day (midnight to midnight) from the houses touched in it. */
export function summarise(houses: House[], date: string): DayRecord {
  const all = blankCounts();
  const biz = blankCounts();
  const roads = new Set<string>();
  let first = 0;
  let last = 0;
  for (const h of houses) {
    if (h.status === 'none' || dayKey(h.ts) !== date) continue;
    addTo(all, h.status);
    if (h.kind === 'biz') addTo(biz, h.status);
    if (h.roadId) roads.add(h.roadId);
    first = first ? Math.min(first, h.ts) : h.ts;
    last = Math.max(last, h.ts);
  }
  return { date, ...all, roads: roads.size, first, last, finished: false, biz };
}

const days = (): Record<string, DayRecord> => (store.meta['days'] as Record<string, DayRecord> | undefined) ?? {};

export function allDays(): DayRecord[] {
  return Object.values(days()).sort((a, b) => (a.date < b.date ? 1 : -1));
}

export async function saveDay(rec: DayRecord): Promise<void> {
  await store.setMeta('days', { ...days(), [rec.date]: rec });
}

/** Today so far, never stored until the day is finished or rolls over. */
export function today(now = Date.now()): DayRecord {
  return summarise(store.houses, dayKey(now));
}

/**
 * Freeze every past day that has knocks but no saved record, so each day's numbers survive.
 * Returns the newest frozen or saved past day that the person has not been shown yet.
 */
export async function rollOver(now = Date.now()): Promise<DayRecord | null> {
  const t = dayKey(now);
  const seen = new Set<string>();
  for (const h of store.houses) if (h.status !== 'none' && h.ts < startOfDay(now)) seen.add(dayKey(h.ts));
  const have = days();
  let changed = false;
  const next = { ...have };
  for (const d of seen) {
    const fresh = summarise(store.houses, d);
    // A manually finished day keeps its numbers unless more doors turned up afterwards.
    if (!next[d] || fresh.doors > next[d].doors) {
      next[d] = { ...fresh, finished: next[d]?.finished ?? false };
      changed = true;
    }
  }
  if (changed) await store.setMeta('days', next);
  const past = Object.values(next)
    .filter((d) => d.date < t && d.doors > 0)
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const shown = store.meta['dayShown'] as string | undefined;
  if (past && (!shown || past.date > shown)) return past;
  return null;
}

export const markShown = (date: string): Promise<void> => store.setMeta('dayShown', date);

const pct = (a: number, b: number): number => (b ? Math.round((a / b) * 100) : 0);
const hhmm = (ts: number): string => new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

export function dateLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

/** Plain text version to paste into a message to your manager. */
export function summaryText(r: DayRecord): string {
  const lines = [
    `Door2Door, ${dateLabel(r.date)}`,
    `${r.doors} doors knocked`,
    `${r.noanswer} no answer, ${r.answered} answered (${pct(r.answered, r.doors - r.stages)}% of doors with someone in)`,
    `Of those answered: ${r.no} not interested, ${r.follow} follow-up, ${r.left ?? 0} left my number, ${r.appt} appointments, ${r.sale} sales`
  ];
  const b = r.biz;
  if (b && b.doors) {
    const h = homesOf(r);
    lines.push(`Homes: ${h.doors} doors, ${h.noanswer} no answer, ${h.answered} answered, ${h.appt} appointments, ${h.sale} sales`);
    lines.push(`Businesses: ${b.doors} visits, ${b.noanswer} manager not in, ${b.answered} spoke to someone, ${b.appt} appointments, ${b.sale} sales`);
  }
  if (r.stages) lines.push(`${r.stages} empty, renovating or new places logged to check back on`);
  if (r.doors) lines.push(`${r.roads} road${r.roads === 1 ? '' : 's'}, ${hhmm(r.first)} to ${hhmm(r.last)}`);
  return lines.join('\n');
}

/** The home part of a day: the totals minus the business counts. */
export function homesOf(r: DayRecord): DayCounts {
  const b = r.biz ?? blankCounts();
  return {
    doors: r.doors - b.doors, noanswer: r.noanswer - b.noanswer, answered: r.answered - b.answered, no: r.no - b.no,
    follow: r.follow - b.follow, left: (r.left ?? 0) - b.left, appt: r.appt - b.appt, sale: r.sale - b.sale, stages: r.stages - b.stages
  };
}

export { hhmm, pct };
