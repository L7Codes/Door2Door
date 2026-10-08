import type { Lookup } from './types';

export interface Fix {
  lat: number;
  lng: number;
  acc: number;
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

export function watchGps(onFix: (f: Fix) => void, onState: (s: GpsState) => void): void {
  if (!('geolocation' in navigator)) {
    onState('unsupported');
    return;
  }
  navigator.geolocation.watchPosition(
    (p) => {
      onState('ok');
      onFix({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy });
    },
    (e) => onState(e.code === 1 ? 'blocked' : 'waiting'),
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 }
  );
}
