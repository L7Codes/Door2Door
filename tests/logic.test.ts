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
