import { describe, expect, it } from 'vitest';
import { guessNext, matchRoad, mergeSnapshots, normaliseRoad, tally, distance } from '../src/logic';
import type { House, Road } from '../src/types';

const road = (id: string, name: string, lat = 51.56, lng = 0.56): Road => ({ id, name, area: '', lat, lng });
const house = (o: Partial<House>): House => ({
  id: 'h', roadId: 'r1', num: '1', lat: 51.56, lng: 0.56, status: 'noanswer', name: '', phone: '', note: '', appt: '', ts: 0, ...o
});

describe('guessNext', () => {
  it('starts at 1 with no history', () => expect(guessNext([])).toBe(1));
  it('steps by 2 after a single house', () => expect(guessNext(['12'])).toBe(14));
  it('keeps walking the same direction and step', () => {
    expect(guessNext(['12', '14'])).toBe(16);
    expect(guessNext(['15', '13'])).toBe(11);
    expect(guessNext(['1', '2'])).toBe(3);
  });
  it('ignores a big jump and falls back to 2', () => expect(guessNext(['3', '40'])).toBe(42));
  it('copes with letters like 14A', () => expect(guessNext(['14A'])).toBe(16));
  it('never goes below 1', () => expect(guessNext(['3', '1'])).toBe(1));
});

describe('road matching', () => {
  it('treats abbreviations as the same road', () => {
    expect(normaliseRoad('Kennington Ave')).toBe(normaliseRoad('kennington avenue'));
    expect(normaliseRoad('Oak Rd.')).toBe('oak road');
  });
  it('matches the same name nearby', () => {
    const r = road('a', 'Church Road');
    expect(matchRoad([r], [], 'church rd', 51.5601, 0.5601)).toBe(r);
  });
  it('keeps same-named roads in different towns apart', () => {
    const basildon = road('a', 'Church Road', 51.57, 0.46);
    expect(matchRoad([basildon], [house({ roadId: 'a', lat: 51.57, lng: 0.46 })], 'Church Road', 51.59, 0.62)).toBeNull();
  });
  it('can be far from the anchor if a knocked house is close', () => {
    const r = road('a', 'Long Road', 51.5, 0.5);
    expect(matchRoad([r], [house({ roadId: 'a', lat: 51.5, lng: 0.5006 })], 'Long Road', 51.5, 0.5007)).toBe(r);
  });
});

describe('tally', () => {
  const now = new Date('2026-10-08T15:00:00').getTime();
  const today = new Date('2026-10-08T10:00:00').getTime();
  const yesterday = new Date('2026-10-07T10:00:00').getTime();
  it('counts only today, and answered excludes no-answer', () => {
    const t = tally(
      [
        house({ id: '1', status: 'noanswer', ts: today }),
        house({ id: '2', status: 'no', ts: today }),
        house({ id: '3', status: 'appt', ts: today }),
        house({ id: '4', status: 'sale', ts: today }),
        house({ id: '5', status: 'sale', ts: yesterday }),
        house({ id: '6', status: 'none', ts: today })
      ],
      now
    );
    expect(t).toEqual({ doors: 4, answered: 3, booked: 1, sales: 1 });
  });
});

describe('merge', () => {
  it('keeps the newest version of each house', () => {
    const cur = { houses: [house({ id: 'a', status: 'no', ts: 5 })], roads: [], cursor: null };
    const inc = { houses: [house({ id: 'a', status: 'sale', ts: 9 }), house({ id: 'b', ts: 1 })], roads: [], cursor: null };
    const m = mergeSnapshots(cur, inc);
    expect(m.houses.find((h) => h.id === 'a')?.status).toBe('sale');
    expect(m.houses).toHaveLength(2);
  });
});

describe('distance', () => {
  it('is about 111m per 0.001 degree of latitude', () => {
    expect(Math.round(distance(51, 0, 51.001, 0))).toBeGreaterThan(105);
    expect(Math.round(distance(51, 0, 51.001, 0))).toBeLessThan(117);
  });
});

import { dueEmpty, inDays } from '../src/logic';
describe('empty house reminders', () => {
  it('flags empty houses once their date arrives', () => {
    const now = Date.now();
    const mk = (status: string, appt: string) => ({ id: appt + status, roadId: 'r', num: '1', lat: 0, lng: 0, status, name: '', phone: '', note: '', appt, ts: now }) as never;
    const hs = [mk('empty', inDays(-1, now)), mk('empty', inDays(0, now)), mk('empty', inDays(5, now)), mk('empty', ''), mk('sale', inDays(-3, now))];
    expect(dueEmpty(hs, now)).toHaveLength(2);
  });
});

import { summarise, rollOver, today } from '../src/day';
import { addHist } from '../src/logic';
import { store } from '../src/store';
describe('daily summary', () => {
  const mk = (id: string, status: string, ts: number, roadId = 'r1') => ({ id, roadId, num: id, lat: 0, lng: 0, status, name: '', phone: '', note: '', appt: '', ts }) as never;
  it('counts a local day from midnight to midnight', () => {
    const d = new Date(2026, 9, 9, 10, 0).getTime();
    const date = '2026-10-09';
    const hs = [
      mk('1', 'noanswer', d), mk('2', 'noanswer', d + 1000), mk('3', 'no', d + 2000), mk('4', 'appt', d + 3000),
      mk('5', 'sale', d + 4000), mk('6', 'empty', d + 5000, 'r2'), mk('7', 'none', d + 6000),
      mk('8', 'noanswer', new Date(2026, 9, 8, 23, 59).getTime()), mk('9', 'noanswer', new Date(2026, 9, 10, 0, 0, 1).getTime())
    ];
    const r = summarise(hs, date);
    expect(r).toMatchObject({ doors: 6, noanswer: 2, answered: 3, no: 1, appt: 1, sale: 1, stages: 1, roads: 2 });
  });
  it('keeps a trail of stage changes', () => {
    const t = new Date(2026, 9, 9, 12).getTime();
    let h = addHist('', 'empty', t);
    h = addHist(h, 'empty', t);
    h = addHist(h, 'reserved', t + 30 * 86400000);
    expect(h.split('|')).toHaveLength(2);
  });
  it('freezes a past day on roll-over and only shows it once', async () => {
    const now = new Date(2026, 9, 10, 8, 0).getTime();
    store.houses = [mk('1', 'noanswer', new Date(2026, 9, 9, 15).getTime()), mk('2', 'sale', new Date(2026, 9, 9, 16).getTime())];
    const shown = await rollOver(now);
    expect(shown?.date).toBe('2026-10-09');
    expect(shown?.doors).toBe(2);
    expect((store.meta['days'] as Record<string, unknown>)['2026-10-09']).toBeTruthy();
    expect(today(now).doors).toBe(0);
    await store.setMeta('dayShown', '2026-10-09');
    expect(await rollOver(now)).toBeNull();
    store.houses = [];
  });
});

import { buildTodo, todoCount } from '../src/todo';
describe('to-do list', () => {
  const now = new Date(2026, 9, 9, 12).getTime();
  const mk = (id: string, status: string, appt: string, ts = now) => ({ id, roadId: 'r', num: id, lat: 0, lng: 0, status, name: '', phone: '', note: '', appt, ts }) as never;
  it('groups appointments, calls and check-backs', () => {
    const t = buildTodo(
      [mk('a', 'appt', '2026-10-12T18:00'), mk('b', 'appt', '2026-10-10T18:00'), mk('c', 'follow', ''), mk('d', 'left', inDays(-1, now)),
       mk('e', 'empty', inDays(20, now)), mk('f', 'sale', ''), mk('g', 'noanswer', '')],
      now
    );
    expect(t.appts.map((h) => h.id)).toEqual(['b', 'a']);
    expect(t.calls.map((h) => h.id)).toEqual(['c']);
    expect(t.due.map((h) => h.id)).toEqual(['d']);
    expect(t.soon.map((h) => h.id)).toEqual(['e']);
    expect(todoCount(t, now)).toBe(2);
  });
});
