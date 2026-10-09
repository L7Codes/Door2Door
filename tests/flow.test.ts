import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { store } from '../src/store';
import { initSheet, sheet } from '../src/ui';
import { handleFlowAction, initFlow, knock, knockHint } from '../src/flow';

let fix = { lat: 51.56, lng: 0.56, acc: 6 };
let nominatim: { road?: string; house_number?: string } = {};
let shop: { name?: string; category?: string } = {};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const text = () => document.getElementById('sheet')!.textContent ?? '';
const click = (a: string, extra: Record<string, string> = {}) => {
  const el = document.createElement('button');
  el.dataset['a'] = a;
  Object.entries(extra).forEach(([k, v]) => (el.dataset[k] = v));
  handleFlowAction(a, el);
};
const type = (id: string, v: string) => ((document.getElementById(id) as HTMLInputElement).value = v);

beforeEach(async () => {
  if (document.getElementById('sheet')) sheet.close();
  document.body.innerHTML = '<div id="sheet" hidden></div><div id="scrim" hidden></div><div id="toast" hidden></div>';
  initSheet();
  sheet.onAction((a, el) => {
    if (a === 'close') sheet.close();
    else handleFlowAction(a, el);
  });
  await store.load();
  await store.replaceAll({ houses: [], roads: [], cursor: null });
  shop = {};
  await store.setMeta('lastKind', 'home');
  initFlow({ getFix: () => fix, getCentre: () => fix, changed: () => {} });
  vi.stubGlobal('fetch', () => Promise.resolve({ ok: true, json: () => Promise.resolve({ ...shop, address: { suburb: 'Vange', ...nominatim } }) }));
});

describe('knock flow', () => {
  it('asks for the number on an unmapped house, then walks the road with a good guess', async () => {
    nominatim = { road: 'Kennington Avenue' };
    await knock();
    expect(text()).toContain('Is this Kennington Avenue?');
    expect((document.getElementById('road') as HTMLInputElement).value).toBe('Kennington Avenue');
    type('num', '2');
    click('road-done');
    click('save', { s: 'noanswer' });
    await sleep(60);
    expect(store.houses).toHaveLength(1);
    expect(store.houses[0].num).toBe('2');
    expect(knockHint()).toBe('Kennington Avenue, next 4');

    sheet.close();
    fix = { ...fix, lat: fix.lat + 0.00005 };
    await knock();
    expect(text()).toContain('Still on Kennington Avenue?');
    expect(document.querySelector('.num')?.textContent).toBe('4');
    click('same-yes');
    click('answered');
    click('interested');
    type('f-name', 'Sam');
    type('f-phone', '0712');
    click('save-form', { s: 'follow' });
    await sleep(60);
    expect(store.houses).toHaveLength(2);
    const h = store.houses.find((x) => x.num === '4')!;
    expect(h.status).toBe('follow');
    expect(h.name).toBe('Sam');
    expect(store.cursor?.nums).toEqual(['2', '4']);
  });

  it('does a fresh check when you have moved on: asks for the number instead of guessing', async () => {
    nominatim = { road: 'Kennington Avenue' };
    await knock();
    type('num', '30');
    click('road-done');
    click('save', { s: 'noanswer' });
    await sleep(40);
    sheet.close();
    fix = { ...fix, lat: fix.lat + 0.00030 }; // ~33m away
    await knock();
    expect(text()).not.toContain('Still on');
    expect(text()).toContain('House number');
    expect((document.getElementById('num') as HTMLInputElement).value).toBe('');
    expect((document.getElementById('road') as HTMLInputElement).value).toBe('Kennington Avenue');
  });

  it('does not assume the same road when nothing is detected and you are far away', async () => {
    nominatim = { road: 'Kennington Avenue' };
    await knock();
    type('num', '30');
    click('road-done');
    click('save', { s: 'noanswer' });
    await sleep(40);
    sheet.close();
    nominatim = {};
    fix = { ...fix, lat: fix.lat + 0.0006 };
    await knock();
    expect(text()).not.toContain('Still on');
    expect((document.getElementById('road') as HTMLInputElement).value).toBe('');
  });

  it('confirms a recognised address in one tap', async () => {
    nominatim = { road: 'Oak Road', house_number: '14' };
    await knock();
    expect(text()).toContain('Are you at 14 Oak Road?');
    click('confirm-yes');
    click('save', { s: 'noanswer' });
    await sleep(60);
    expect(store.houses[0].num).toBe('14');
    expect(store.road(store.houses[0].roadId)?.name).toBe('Oak Road');
  });

  it('notices a change of road and does not assume the old one', async () => {
    nominatim = { road: 'Kennington Avenue' };
    await knock();
    type('num', '2');
    click('road-done');
    click('save', { s: 'noanswer' });
    await sleep(60);
    sheet.close();
    nominatim = { road: 'Linden Road' };
    await knock();
    expect(text()).toContain('Is this Linden Road?');
  });

  it('updates the same house instead of duplicating it', async () => {
    nominatim = { road: 'Oak Road', house_number: '9' };
    await knock();
    click('confirm-yes');
    click('save', { s: 'noanswer' });
    await sleep(60);
    sheet.close();
    await knock();
    click('confirm-yes');
    click('answered');
    click('not-int');
    click('reason', { r: 'No money' });
    await sleep(60);
    expect(store.houses).toHaveLength(1);
    expect(store.houses[0].status).toBe('no');
    expect(store.houses[0].note).toBe('No money');
  });

  it('undo removes a new house and restores the cursor', async () => {
    nominatim = { road: 'Oak Road', house_number: '9' };
    await knock();
    click('confirm-yes');
    click('save', { s: 'noanswer' });
    await sleep(60);
    expect(store.houses).toHaveLength(1);
    (document.querySelector('#toast button') as HTMLButtonElement).click();
    await sleep(60);
    expect(store.houses).toHaveLength(0);
    expect(store.cursor).toBeNull();
  });
});

describe('stale GPS', () => {
  it('asks the phone for a fresh reading when the last one is old, and pins at the new spot', async () => {
    nominatim = { road: 'Foxglove Drive' };
    const g = {
      getCurrentPosition: (ok: (p: unknown) => void) =>
        ok({ coords: { latitude: fix.lat + 0.0003, longitude: fix.lng, accuracy: 5 }, timestamp: Date.now() })
    };
    Object.defineProperty(navigator, 'geolocation', { value: g, configurable: true });
    const old = { ...fix, ts: Date.now() - 60000 };
    const before = old.lat;
    fix = old;
    await knock();
    await sleep(60);
    type('num', '7');
    click('road-done');
    click('save', { s: 'noanswer' });
    await sleep(60);
    expect(store.houses[0].lat).toBeGreaterThan(before + 0.0002);
  });
});

describe('empty houses', () => {
  it('saves an empty house with a check-back date', async () => {
    nominatim = { road: 'Foxglove Drive', house_number: '11' };
    await knock();
    click('confirm-yes');
    click('empty');
    click('empty-save', { d: '14' });
    await sleep(60);
    const h = store.houses[0];
    expect(h.status).toBe('empty');
    expect(h.appt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('left my number', () => {
  it('saves someone who took your number with an 8 week check-back', async () => {
    nominatim = { road: 'Foxglove Drive', house_number: '3' };
    await knock();
    click('confirm-yes');
    click('answered');
    click('interested');
    type('f-note', 'Slightly interested, would not give number');
    click('left-save');
    await sleep(60);
    const h = store.houses[0];
    expect(h.status).toBe('left');
    expect(h.note).toContain('Slightly');
    const days = (new Date(h.appt).getTime() - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(54);
    expect(days).toBeLessThan(57);
  });
});

describe('businesses', () => {
  it('knows a shop from the map, saves its name and type, and calls no answer "Manager not in"', async () => {
    nominatim = { road: 'High Street', house_number: '12' };
    shop = { name: 'Costcutter', category: 'shop' };
    await knock();
    click('confirm-yes');
    expect(text()).toContain('Manager not in');
    expect((document.getElementById('b-name') as HTMLInputElement).value).toBe('Costcutter');
    click('btype', { t: 'Convenience store' });
    click('save', { s: 'noanswer' });
    await sleep(60);
    const h = store.houses[0];
    expect(h).toMatchObject({ kind: 'biz', bname: 'Costcutter', btype: 'Convenience store', status: 'noanswer' });
  });
  it('lets you switch to Business on an ordinary address and remembers it', async () => {
    nominatim = { road: 'High Street', house_number: '14' };
    await knock();
    click('confirm-yes');
    click('kind-biz');
    type('b-name', 'Cuts & Co');
    click('btype', { t: 'Barber' });
    click('save', { s: 'noanswer' });
    await sleep(60);
    expect(store.houses[0]).toMatchObject({ kind: 'biz', bname: 'Cuts & Co', btype: 'Barber' });
    expect(store.meta['lastKind']).toBe('biz');
  });
});
