import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { $, ICON } from './dom';
import { restartGps, watchGps, type Fix, type GpsState } from './geo';
import { handleFlowAction, initFlow, knock, knockHint } from './flow';
import { tally } from './logic';
import { DoorMap } from './map';
import { store } from './store';
import { initSheet, notice, sheet, toast } from './ui';
import { applyTheme, handleViewAction, initViews, openDay, openHouse, openRename, openSettings, renderRoads, showYesterday } from './views';
import { rollOver } from './day';
import { buildTodo, renderTodo, todoCount } from './todo';

let fix: Fix | null = null;
let moving = false;
let gps: GpsState = 'waiting';
let view: 'map' | 'roads' | 'todo' = 'map';
let doorMap: DoorMap;

function renderTally(): void {
  const t = tally(store.houses, Date.now());
  const cell = (n: number, label: string): string => `<div><b>${n}</b><span>${label}</span></div>`;
  $('tally').innerHTML = cell(t.doors, 'doors') + cell(t.answered, 'answered') + cell(t.booked, 'booked') + cell(t.sales, 'sales') + '<i aria-hidden="true">›</i>';
}

function renderNotice(): void {
  if (gps === 'blocked')
    return notice('Location is blocked. Swipe Door2Door away, reopen it and tap Allow when asked. Tap here to try again.', restartGps);
  if (gps === 'unsupported') return notice('This browser cannot give a GPS position.');
  const todo = todoCount(buildTodo(store.houses));
  if (todo && view === 'map') return notice(`${todo} thing${todo > 1 ? 's' : ''} on your to-do list. Tap to see.`, () => setView('todo'));
  const last = store.meta['lastBackup'] as number | undefined;
  const stale = !last || Date.now() - last > 7 * 86400000;
  if (store.houses.length >= 5 && stale) return notice('Save a backup so your houses are safe. Tap here.', () => void openSettings());
  notice(null);
}

function changed(): void {
  doorMap.drawPins();
  renderTally();
  if (view === 'roads') renderRoads();
  if (view === 'todo') renderTodo();
  renderTodoBadge();
  $('k-sub').textContent = knockHint();
  renderNotice();
}

function renderTodoBadge(): void {
  const n = todoCount(buildTodo(store.houses));
  $('nav-todo').innerHTML = `${ICON.todo}<span>${n ? `To-do ${n}` : 'To-do'}</span>`;
}

function setView(v: 'map' | 'roads' | 'todo'): void {
  view = v;
  const map = v === 'map';
  $('map').hidden = !map;
  $('roads').hidden = v !== 'roads';
  $('todo').hidden = v !== 'todo';
  document.querySelector<HTMLElement>('.fab-col')!.hidden = !map;
  const nav = $('nav-roads');
  nav.setAttribute('aria-pressed', String(v === 'roads'));
  nav.innerHTML = v === 'roads' ? `${ICON.map}<span>Map</span>` : `${ICON.roads}<span>Roads</span>`;
  $('nav-todo').setAttribute('aria-pressed', String(v === 'todo'));
  if (map) setTimeout(() => doorMap.refresh(), 30);
  else if (v === 'roads') renderRoads();
  else renderTodo();
  renderTodoBadge();
  renderNotice();
}

async function boot(): Promise<void> {
  await store.load();
  applyTheme();
  doorMap = new DoorMap($('map'), (id) => (moving ? undefined : openHouse(id)));
  const last = store.houses[store.houses.length - 1];
  if (last) doorMap.centreOn(last.lat, last.lng, 18);

  $('btn-layers').innerHTML = ICON.layers;
  $('btn-layers').setAttribute('aria-pressed', String(doorMap.satellite));
  $('btn-locate').innerHTML = ICON.locate;
  const filterText = (f: string): string => (f === 'home' ? 'Homes' : f === 'biz' ? 'Shops' : 'All');
  $('btn-filter').textContent = filterText(doorMap.filter);
  $('nav-menu').innerHTML = `${ICON.menu}<span>Menu</span>`;

  initSheet();
  initFlow({ getFix: () => fix, getCentre: () => doorMap.centre(), changed });
  initViews({
    changed,
    movePin: (id) => {
      const h = store.house(id);
      if (!h) return;
      sheet.close();
      moving = true;
      doorMap.centreOn(h.lat, h.lng, 20);
      const done = (): void => {
        moving = false;
        notice(null);
        doorMap.map.off('click', onTap);
      };
      const onTap = (e: { latlng: { lat: number; lng: number } }): void => {
        const cur = store.house(id);
        done();
        if (!cur) return;
        void store.putHouse({ ...cur, lat: e.latlng.lat, lng: e.latlng.lng, ts: Date.now() }).then(() => {
          changed();
          toast(`${cur.num || 'Pin'} moved`);
        });
      };
      doorMap.map.on('click', onTap);
      notice(`Tap the map where ${h.num || 'this door'} is. Tap here to cancel.`, done);
    },
    goto: (h) => {
      setView('map');
      doorMap.centreOn(h.lat, h.lng);
      openHouse(h.id);
    }
  });
  sheet.onAction((a, el) => {
    if (a === 'close') return sheet.close();
    if (handleFlowAction(a, el)) return;
    handleViewAction(a, el);
  });

  const tallyEl = $('tally');
  tallyEl.setAttribute('role', 'button');
  tallyEl.tabIndex = 0;
  tallyEl.onclick = () => {
    if (!sheet.isOpen()) openDay();
  };
  tallyEl.onkeydown = (e) => {
    if (e.key === 'Enter' && !sheet.isOpen()) openDay();
  };
  const newDay = async (): Promise<void> => {
    const r = await rollOver();
    if (r && !sheet.isOpen()) await showYesterday(r);
    renderTally();
  };
  void newDay();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void newDay();
  });
  setInterval(() => void newDay(), 5 * 60000);

  $('btn-filter').onclick = () => ($('btn-filter').textContent = filterText(doorMap.cycleFilter()));
  $('btn-layers').onclick = () => $('btn-layers').setAttribute('aria-pressed', String(doorMap.toggleBase()));
  $('btn-locate').onclick = () => fix && doorMap.centreOn(fix.lat, fix.lng);
  $('nav-roads').onclick = () => setView(view === 'roads' ? 'map' : 'roads');
  $('nav-todo').onclick = () => setView(view === 'todo' ? 'map' : 'todo');
  $('nav-menu').onclick = () => void openSettings();
  $('knock').onclick = () => {
    if (view !== 'map') setView('map');
    void knock();
  };
  const gotoHouse = (e: Event): void => {
    const g = (e.target as HTMLElement).closest<HTMLElement>('[data-goto]');
    const h = g ? store.house(g.dataset['goto'] ?? '') : null;
    if (h) {
      setView('map');
      doorMap.centreOn(h.lat, h.lng);
      openHouse(h.id);
    }
  };
  $('todo').addEventListener('click', gotoHouse);
  $('roads').addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const g = t.closest<HTMLElement>('[data-goto]');
    const r = t.closest<HTMLElement>('[data-rename]');
    if (g) {
      const h = store.house(g.dataset['goto'] ?? '');
      if (h) {
        setView('map');
        doorMap.centreOn(h.lat, h.lng);
        openHouse(h.id);
      }
    } else if (r) openRename(r.dataset['rename'] ?? '');
  });

  watchGps(
    (f) => {
      fix = f;
      doorMap.setFix(f);
      $('k-sub').textContent = knockHint();
    },
    (s) => {
      gps = s;
      renderNotice();
    }
  );

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && gps !== 'ok') restartGps();
  });

  setView('map');
  changed();
  void navigator.storage?.persist?.();
  registerSW({ immediate: true });
  setInterval(renderTally, 60000);
}

void boot();
