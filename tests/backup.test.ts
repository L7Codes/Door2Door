import { describe, expect, it } from 'vitest';
import { makeBackup, parseBackup, toCsv } from '../src/backup';
import type { Snapshot } from '../src/types';

const snap: Snapshot = {
  roads: [{ id: 'r1', name: 'Oak Road', area: 'Vange', lat: 51.5, lng: 0.5 }],
  houses: [
    { id: 'h1', roadId: 'r1', num: '14', lat: 51.5, lng: 0.5, status: 'follow', name: 'Sam "S" Lee', phone: '07123', note: '=SUM(A1)', appt: '', ts: 1000 }
  ],
  cursor: { roadId: 'r1', lat: 51.5, lng: 0.5, nums: ['12', '14'] }
};

describe('backup', () => {
  it('round-trips', () => expect(parseBackup(makeBackup(snap))).toEqual(snap));
  it('rejects other files', () => {
    expect(parseBackup('nonsense')).toBeNull();
    expect(parseBackup('{"app":"other"}')).toBeNull();
    expect(parseBackup('[]')).toBeNull();
  });
  it('drops malformed rows instead of trusting them', () => {
    const bad = JSON.stringify({
      app: 'door2door',
      roads: [{ id: 'r1', name: 'X', lat: 'nope', lng: 1 }],
      houses: [{ id: 'h', status: 'hacked', lat: 1, lng: 1 }, { id: 'ok', status: 'sale', lat: 1, lng: 2 }]
    });
    const p = parseBackup(bad)!;
    expect(p.roads).toHaveLength(0);
    expect(p.houses.map((h) => h.id)).toEqual(['ok']);
  });
  it('csv escapes quotes and neutralises formulas', () => {
    const csv = toCsv(snap);
    expect(csv).toContain('"Sam ""S"" Lee"');
    expect(csv).toContain(`"'=SUM(A1)"`);
    expect(csv.split('\n')).toHaveLength(2);
  });
});
