import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseLookup, restartGps, watchGps, type GpsState } from '../src/geo';

describe('lookup parsing', () => {
  it('reads road, number and area', () => {
    expect(parseLookup({ address: { house_number: '14', road: 'Oak Road', suburb: 'Vange', postcode: 'SS16 5AA' } })).toEqual({
      num: '14', road: 'Oak Road', area: 'Vange', postcode: 'SS16 5AA'
    });
  });
  it('copes with a road and nothing else', () => {
    expect(parseLookup({ address: { road: 'Kennington Avenue' } })?.num).toBe('');
  });
  it('returns null with no address', () => expect(parseLookup(null)).toBeNull());
});

describe('gps', () => {
  let mode: 'deny' | 'allow';
  const states: GpsState[] = [];
  beforeEach(() => {
    states.length = 0;
    mode = 'deny';
    vi.stubGlobal('navigator', {
      geolocation: {
        watchPosition: (ok: (p: unknown) => void, err: (e: { code: number }) => void) => {
          setTimeout(() => (mode === 'deny' ? err({ code: 1 }) : ok({ coords: { latitude: 1, longitude: 2, accuracy: 5 } })), 0);
          return 1;
        },
        clearWatch: () => {}
      }
    });
  });
  it('reports blocked, then recovers when asked again', async () => {
    const fixes: number[] = [];
    watchGps((f) => fixes.push(f.lat), (s) => states.push(s));
    await new Promise((r) => setTimeout(r, 5));
    expect(states).toEqual(['blocked']);
    mode = 'allow';
    restartGps();
    await new Promise((r) => setTimeout(r, 5));
    expect(states).toEqual(['blocked', 'ok']);
    expect(fixes).toEqual([1]);
  });
});
