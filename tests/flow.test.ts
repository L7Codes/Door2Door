import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { store } from '../src/store';
import { initSheet, sheet } from '../src/ui';
import { handleFlowAction, initFlow, knock, knockHint } from '../src/flow';

let fix = { lat: 51.56, lng: 0.56, acc: 6 };
let nominatim: { road?: string; house_number?: string } = {};
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
  initFlow({ getFix: () => fix, getCentre: () => fix, changed: () => {} });
  vi.stubGlobal('fetch', () => Promise.resolve({ ok: true, json: () => Promise.resolve({ address: { suburb: 'Vange', ...nominatim } }) }));
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
