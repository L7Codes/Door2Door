import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { Store } from '../src/store';
import type { House } from '../src/types';

const h = (id: string, ts = 1): House => ({
  id, roadId: 'r', num: '1', lat: 1, lng: 1, status: 'noanswer', name: '', phone: '', note: '', appt: '', ts
});

describe('store', () => {
  it('persists across a reload', async () => {
    const a = new Store();
    await a.load();
    expect(a.durable).toBe(true);
    await a.putRoad({ id: 'r', name: 'Oak Road', area: '', lat: 1, lng: 1 });
    await a.putHouse(h('x'));
    await a.putHouse({ ...h('x'), status: 'sale' });
    await a.setCursor({ roadId: 'r', lat: 1, lng: 1, nums: ['1'] });
    const b = new Store();
    await b.load();
    expect(b.houses).toHaveLength(1);
    expect(b.houses[0].status).toBe('sale');
    expect(b.roads[0].name).toBe('Oak Road');
    expect(b.cursor?.nums).toEqual(['1']);
  });
  it('deletes and replaces', async () => {
    const a = new Store();
    await a.load();
    await a.deleteHouse('x');
    expect(a.houses).toHaveLength(0);
    await a.replaceAll({ houses: [h('p'), h('q')], roads: [], cursor: null });
    const b = new Store();
    await b.load();
    expect(b.houses.map((x) => x.id).sort()).toEqual(['p', 'q']);
  });
});
