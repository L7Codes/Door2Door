import type { Lookup } from './types';

export interface Fix {
  lat: number;
  lng: number;
  acc: number;
  /** When the phone took this reading (ms). Missing means treat as fresh. */
  ts?: number;
}

type Raw = { address?: Record<string, string> } | null | undefined;

export function parseLookup(j: Raw): Lookup | null {
  const a = j?.address;
  if (!a) return null;
  return {
    num: a.house_number ?? '',
    road: a.road ?? a.pedestrian ?? '',
    area: a.suburb ?? a.village ?? a.town ?? a.city ?? '',
    postcode: a.postcode ?? ''
  };
}

/** Ask OpenStreetMap what is at this spot. Gives up after a few seconds so the app never waits. */
export async function lookup(lat: number, lng: number, ms = 3500): Promise<Lookup | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const url =
      'https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=19&accept-language=en-GB' +
      `&lat=${lat}&lon=${lng}`;
    const res = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    return parseLookup((await res.json()) as Raw);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export type GpsState = 'waiting' | 'ok' | 'blocked' | 'unsupported';

let watchId: number | null = null;
let cbFix: ((f: Fix) => void) | null = null;
let cbState: ((s: GpsState) => void) | null = null;

function begin(): void {
  if (!cbFix || !cbState) return;
  if (!('geolocation' in navigator)) {
    cbState('unsupported');
    return;
  }
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  const onFix = cbFix;
  const onState = cbState;
  watchId = navigator.geolocation.watchPosition(
    (p) => {
      onState('ok');
      onFix({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, ts: p.timestamp });
    },
    (e) => {
      // Code 1 = permission refused. On an iPhone Home Screen app this lasts until the app is closed and reopened.
      onState(e.code === 1 ? 'blocked' : 'waiting');
    },
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 }
  );
}

export function watchGps(onFix: (f: Fix) => void, onState: (s: GpsState) => void): void {
  cbFix = onFix;
  cbState = onState;
  begin();
}

/** Ask again. Call from a tap or when the app comes back to the front. */
export function restartGps(): void {
  begin();
}

/** Ask the phone for a brand new reading right now (never a cached one). Null if it cannot in time. */
export function freshPosition(ms = 6000): Promise<Fix | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, ts: p.timestamp }),
      () => resolve(null),
      { enableHighAccuracy: true, maximumAge: 0, timeout: ms }
    );
  });
}
