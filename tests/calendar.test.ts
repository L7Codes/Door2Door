import { describe, expect, it } from 'vitest';
import { buildIcs, safeNote } from '../src/calendar';
import { nearbyDue } from '../src/logic';
import type { House, Road } from '../src/types';

const road: Road = { id: 'r1', name: 'Foxglove Drive', area: '', lat: 51.56, lng: 0.56 };
const house = (o: Partial<House>): House => ({
  id: 'h', roadId: 'r1', num: '9', lat: 51.56, lng: 0.56, status: 'noanswer', name: '', phone: '', note: '', appt: '', ts: 0, ...o
});
const NOW = new Date('2026-10-09T10:00:00').getTime();

describe('safeNote', () => {
  it('strips phones and emails', () => {
    expect(safeNote('ring 07700 900123 or bob@x.com about loft')).toBe('ring or about loft');
  });
});

describe('buildIcs', () => {
  it('never contains names or phones, and is all-day for check-backs', () => {
    const h = house({ status: 'empty', appt: '2026-11-01', name: 'Sarah Jones', phone: '07700900123', note: 'back garden gate, 07700900123', pc: 'SS1 2AB' });
    const { text, count } = buildIcs([h], [road], true, new Date(NOW));
    expect(count).toBe(1);
    expect(text).not.toContain('Sarah');
    expect(text).not.toContain('07700');
    expect(text).toContain('DTSTART;VALUE=DATE:20261101');
    expect(text).toContain('SUMMARY:9 SS1 2AB: Check back: not sold yet');
    expect(text).toContain('back garden gate');
  });
  it('times appointments and can leave notes out', () => {
    const h = house({ status: 'appt', appt: '2026-10-12T18:30', note: 'secret' });
    const { text } = buildIcs([h], [road], false, new Date(NOW));
    expect(text).toContain('DTSTART:20261012T183000');
    expect(text).toContain('DTEND:20261012T193000');
    expect(text).not.toContain('secret');
    expect(text).toContain('TRIGGER:-P1D');
    expect(text).toContain('TRIGGER:-PT12H');
    expect(text).toContain('TRIGGER:-PT2H');
  });
  it('skips houses with no date', () => {
    expect(buildIcs([house({ status: 'no' })], [road], true, new Date(NOW)).count).toBe(0);
  });
});

describe('nearbyDue', () => {
  const at = (s: Partial<House>) => house({ appt: '', ...s });
  it('uses a 7 day window for long intervals and 3 for short ones', () => {
    const long = at({ id: 'a', status: 'empty', appt: '2026-10-15' }); // 6 days
    const longFar = at({ id: 'b', status: 'empty', appt: '2026-10-20' }); // 11 days
    const short = at({ id: 'c', status: 'movingin', appt: '2026-10-11' }); // 2 days
    const shortFar = at({ id: 'd', status: 'movingin', appt: '2026-10-14' }); // 5 days
    const ids = nearbyDue([long, longFar, short, shortFar], 51.56, 0.56, NOW).map((n) => n.house.id);
    expect(ids.sort()).toEqual(['a', 'c']);
  });
  it('includes overdue and ignores far away houses', () => {
    const over = at({ id: 'o', status: 'left', appt: '2026-10-01' });
    const far = at({ id: 'f', status: 'empty', appt: '2026-10-01', lat: 52.5 });
    const r = nearbyDue([over, far], 51.56, 0.56, NOW);
    expect(r.map((n) => n.house.id)).toEqual(['o']);
    expect(r[0].daysLeft).toBeLessThan(0);
  });
});
